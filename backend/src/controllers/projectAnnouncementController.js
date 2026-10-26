// src/controllers/projectAnnouncementController.js
//
// The project lifecycle actions: launch once, announce a major update, and the
// separately confirmed promotional restart.
//
// WHAT EACH ACTION MAY TOUCH, which is the whole design:
//
//                      launchedAt   newlyLaunchedUntil   mail   community post
//   Launch              set once    set (30 days)        yes    yes
//   Edit (elsewhere)    never       never                no     no
//   Major update        never       never                yes    yes
//   Promo restart       never       set (30 days)        no     no
//
// A project is launched ONCE, and the only announcement after that is a major
// update. There is deliberately no "re-announce": every post-launch message to
// the community has to say what changed, which is why the summary below is
// required and has no default.
//
// Editing lives in projectsController.updateProject and deliberately has no
// entry here: it writes a whitelist of content columns and none of the launch
// columns are in it, so an edit cannot move a launch date or a badge even by
// accident (§4).
//
// Every endpoint re-checks the admin's role (the route gate) AND the project's
// own eligibility before acting. The UI hides buttons it should not offer, but
// that is cosmetic - this file is what enforces it (§2, §13).
const crypto = require('crypto');
const prisma = require('../utils/prismaClient');
const { logActivity } = require('../services/activityLog');
const { memberCardSelect } = require('../services/memberVisibility');
const launch = require('../services/projectLaunch');
const worker = require('../services/announcementWorker');

// ── Input coercion ────────────────────────────
const LIMITS = { title: 200, message: 4000, detail: 8000, reason: 500 };

const text = (value, max) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
};

/**
 * An idempotency key supplied by the client.
 *
 * Constrained rather than trusted: it goes into a unique index, so an
 * unbounded value would be a cheap way to bloat it. A caller that sends none
 * gets a random one, which still prevents a double-click from the SAME request
 * being replayed by a proxy, but cannot recognise a manual retry - so the
 * frontend always sends its own and keeps it for the life of the composer.
 */
const idempotencyKey = (value, fallbackPrefix) => {
  const given = text(value, 100);
  if (given && /^[A-Za-z0-9:_.-]{8,100}$/.test(given)) return `${fallbackPrefix}:${given}`;
  return `${fallbackPrefix}:${crypto.randomUUID()}`;
};

/** The project as the lifecycle panel needs it, launcher included. */
const findProject = (id) => prisma.project.findUnique({
  where: { id },
  include: { launchedBy: { select: memberCardSelect() } },
});

/** The audience choices and defaults the composer needs to render itself. */
const composerOptions = (project) => ({
  audiences: Object.entries(launch.AUDIENCES).map(([value, spec]) => ({ value, label: spec.label })),
  updateCategories: Object.entries(launch.UPDATE_CATEGORIES).map(([value, label]) => ({ value, label })),
  defaults: {
    launchTitle: 'New Project Launched!',
    launchMessage: launch.defaultLaunchMessage(project),
    // No default for a major update's title or summary, deliberately: §6 says
    // not to invent what changed, and a prefilled summary is the fastest way
    // to mail the community something nobody actually wrote.
  },
  promoDays: launch.PROMO_DAYS,
  projectUrl: launch.projectUrl(project.id),
});

// ── Action one: launch ────────────────────────
/**
 * POST /projects/:id/launch
 *
 * The official first launch. The launch itself is one transaction that records
 * the timestamp, the admin, the state, the promotional window and the
 * announcement with its full send list. Everything after that commit - the
 * community post, the emails, the activity log - is best-effort, because §3 is
 * explicit that a project must stay launched even when the mail fails.
 */
const launchProject = async (req, res) => {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const rules = launch.eligibility(project);

    // Answered before the generic eligibility check so the admin gets the
    // specific wording §12 asks for rather than "cannot be launched".
    if (project.launchState === 'LAUNCHED') {
      return res.status(409).json({
        error: 'This project has already been launched. Use Announce Major Update '
             + 'to tell the community about a change to it.',
        launch: launch.launchSummary(project),
      });
    }
    if (!rules.canLaunch) {
      return res.status(409).json({
        error: rules.reasons[0] || 'This project cannot be launched yet.',
        reasons: rules.reasons,
        launch: launch.launchSummary(project),
      });
    }

    // Server time, never a client-supplied date: §3 asks for the launch
    // timestamp to be the server's, and it is what every badge is measured
    // against.
    const now = new Date();
    const promoEnds = launch.promoEndFrom(now);

    const title = text(req.body?.title, LIMITS.title) || 'New Project Launched!';
    const message = text(req.body?.message, LIMITS.message) || launch.defaultLaunchMessage(project);

    const { announcement, created } = await launch.createAnnouncement({
      project,
      type: 'INITIAL_LAUNCH',
      // Deterministic: a project has exactly one initial launch, so two admins
      // clicking at the same moment collide on the unique index and the second
      // is answered with the first one's announcement rather than launching
      // twice (§3 step 8, "a unique initial launch announcement record").
      idempotencyKey: `launch:${project.id}`,
      title,
      message,
      audience: launch.isAudience(req.body?.audience) ? req.body.audience : launch.DEFAULT_AUDIENCE,
      admin: req.user,
      projectData: {
        launchedAt: now,
        launchedById: req.user.id,
        launchState: 'LAUNCHED',
        newlyLaunchedUntil: promoEnds,
        promoStartedAt: now,
        // A draft becomes visible on launch, which is what launching means.
        // FUNDED and CLOSED projects are left alone - they are already
        // published, and overwriting their status would undo a deliberate
        // decision somebody else made.
        ...(project.status === 'DRAFT' ? { status: 'ACTIVE' } : {}),
      },
      promo: { startedAt: now, endsAt: promoEnds },
    });

    // The launch is committed from here on. Nothing below may throw in a way
    // that takes the launch with it.
    const fresh = await findProject(project.id);

    if (created) {
      await launch.publishCommunityAnnouncement(announcement, fresh);
      logActivity({
        type: 'PROJECT_LAUNCHED',
        title: `Project launched: ${fresh.title}`,
        description: `Announced to ${announcement.recipientCount} member(s); `
                   + `newly launched until ${promoEnds.toISOString().slice(0, 10)}`,
        actorId: req.user.id,
        actorName: req.user.name,
        metadata: {
          projectId: fresh.id,
          announcementId: announcement.id,
          recipientCount: announcement.recipientCount,
          newlyLaunchedUntil: promoEnds.toISOString(),
        },
      });
      worker.kick();
    }

    const published = await prisma.projectAnnouncement.findUnique({ where: { id: announcement.id } });

    res.status(created ? 201 : 200).json({
      // Reports what actually happened, and stops short of claiming the email
      // has gone anywhere (§12).
      message: created
        ? 'Project launched successfully. The community announcement has been created '
          + 'and email delivery is being processed.'
        : 'This project was already launched by this request.',
      launch: launch.launchSummary(fresh),
      announcement: published,
    });
  } catch (err) {
    console.error('launchProject error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Action three: major update ─────────────────
/**
 * POST /projects/:id/announcements/major-update
 *
 * Communicates a material change, and is the ONLY way to announce a project
 * that has already launched.
 *
 * The "What's New?" summary is REQUIRED and comes entirely from the admin: §6
 * says not to invent it, so there is no default and no server-side
 * generation. An empty one is a 400. That requirement is also what replaces a
 * plain re-announcement - if there is nothing to report, there is nothing to
 * send.
 *
 * The promotional badge is untouched. A project still inside its original 30
 * days keeps the badge until that original expiry; one whose window has passed
 * stays expired. Renewing it is the separate, separately confirmed action
 * below (§6 "Promotional badge behaviour").
 */
const majorUpdate = async (req, res) => {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const rules = launch.eligibility(project);
    if (!rules.canAnnounce) {
      return res.status(409).json({
        error: project.launchState === 'LAUNCHED'
          ? (rules.reasons[0] || 'This project cannot be announced right now.')
          : 'This project has not been launched yet. Launch it before announcing an update.',
        reasons: rules.reasons,
        launch: launch.launchSummary(project),
      });
    }

    const title = text(req.body?.title, LIMITS.title);
    const message = text(req.body?.message, LIMITS.message);
    const detail = text(req.body?.detail, LIMITS.detail) || null;
    const categoryKey = text(req.body?.updateCategory, 40);

    if (!title) return res.status(400).json({ error: 'An update title is required.' });
    if (!message) {
      return res.status(400).json({
        error: 'A "What\'s New?" summary is required - it is what tells members what changed.',
      });
    }
    // Validated against the catalogue rather than stored as free text, so the
    // history cannot fill with values no screen knows how to show.
    if (categoryKey && !launch.UPDATE_CATEGORIES[categoryKey]) {
      return res.status(400).json({ error: 'Unknown update category.' });
    }

    const { announcement, created } = await launch.createAnnouncement({
      project,
      type: 'MAJOR_UPDATE',
      idempotencyKey: idempotencyKey(req.body?.idempotencyKey, `update:${project.id}`),
      title,
      message,
      detail,
      updateCategory: categoryKey ? launch.UPDATE_CATEGORIES[categoryKey] : null,
      audience: launch.isAudience(req.body?.audience) ? req.body.audience : launch.DEFAULT_AUDIENCE,
      admin: req.user,
    });

    if (created) {
      await launch.publishCommunityAnnouncement(announcement, project);
      logActivity({
        type: 'PROJECT_MAJOR_UPDATE',
        title: `Project update announced: ${project.title}`,
        description: `${title} - to ${announcement.recipientCount} member(s)`,
        actorId: req.user.id,
        actorName: req.user.name,
        metadata: { projectId: project.id, announcementId: announcement.id,
                    updateCategory: announcement.updateCategory,
                    recipientCount: announcement.recipientCount },
      });
      worker.kick();
    }

    const published = await prisma.projectAnnouncement.findUnique({ where: { id: announcement.id } });

    res.status(created ? 201 : 200).json({
      message: created
        ? 'Major update published successfully. The community announcement has been created '
          + 'and email delivery is being processed.'
        : 'This update was already published by this request.',
      launch: launch.launchSummary(await findProject(project.id)),
      announcement: published,
    });
  } catch (err) {
    console.error('majorUpdate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Optional action: restart the promotional period ─
/**
 * POST /projects/:id/promo-restart
 *
 * The exceptional case: a project redeveloped enough to deserve another 30
 * days of prominence.
 *
 * It sends NOTHING. §7 is explicit that restarting the badge must not mail
 * anyone or publish an announcement on its own - if the community should hear
 * about it, that is a separate major update, which the panel offers beside
 * this button.
 *
 * The original `launchedAt` is not in the update, so the launch history
 * survives verbatim. The new window is recorded on the project AND as a
 * history row carrying the reason and the admin, which is what makes a
 * renewed badge auditable months later.
 */
const restartPromo = async (req, res) => {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const rules = launch.eligibility(project);
    if (!rules.canRestartPromo) {
      return res.status(409).json({
        error: project.launchState === 'LAUNCHED'
          ? (rules.reasons[0] || 'This promotional period cannot be restarted.')
          : 'This project has not been launched yet, so it has no promotional period to restart.',
        launch: launch.launchSummary(project),
      });
    }

    // Asked for, because "why is this project newly launched again?" is a
    // question somebody will have. Short, and not forced: §7 says require it
    // "where appropriate", and refusing the restart over a blank box would
    // only teach admins to type a full stop.
    const reason = text(req.body?.reason, LIMITS.reason) || null;

    const now = new Date();
    const promoEnds = launch.promoEndFrom(now);
    const nextCount = (project.promoRestartCount || 0) + 1;

    const { announcement, created } = await launch.createAnnouncement({
      project,
      type: 'PROMO_RESTART',
      // Keyed on the restart number, so a retried request cannot stack two
      // windows, while a genuine second restart later gets its own key.
      idempotencyKey: `promo:${project.id}:${nextCount}`,
      title: `Newly Launched period restarted for ${launch.PROMO_DAYS} days`,
      message: reason || 'No reason was recorded.',
      admin: req.user,
      projectData: {
        // launchedAt and launchedById are deliberately absent.
        newlyLaunchedUntil: promoEnds,
        promoStartedAt: now,
        promoRestartCount: nextCount,
      },
      promo: { startedAt: now, endsAt: promoEnds, reason },
    });

    const fresh = await findProject(project.id);

    if (created) {
      logActivity({
        type: 'PROJECT_PROMO_RESTARTED',
        title: `Newly Launched period restarted: ${fresh.title}`,
        description: reason
          ? `${reason} - until ${promoEnds.toISOString().slice(0, 10)}`
          : `Until ${promoEnds.toISOString().slice(0, 10)}, no reason recorded`,
        actorId: req.user.id,
        actorName: req.user.name,
        metadata: { projectId: fresh.id, announcementId: announcement.id,
                    restartCount: nextCount, newlyLaunchedUntil: promoEnds.toISOString(),
                    originalLaunchedAt: fresh.launchedAt },
      });
    }

    res.status(created ? 201 : 200).json({
      message: `The Newly Launched period has been restarted for ${launch.PROMO_DAYS} days.`,
      launch: launch.launchSummary(fresh),
      announcement,
    });
  } catch (err) {
    console.error('restartPromo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Classification of pre-feature projects (§8) ─
/**
 * POST /projects/:id/launch-classify
 *
 * The review workflow for a project that was already published when this
 * module arrived. The migration marked every such project PRE_FEATURE and
 * invented nothing; this is where an admin resolves one.
 *
 * `decision: 'previously_launched'` records "this was launched before we
 * tracked launches" and nothing else: no date is written, because nobody knows
 * it, and §8 forbids making one up. No email, no announcement, no badge.
 *
 * The other resolution is simply to use Launch Project, which treats today as
 * the project's official launch and announces it properly.
 */
const classifyLaunch = async (req, res) => {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.launchState !== 'PRE_FEATURE') {
      return res.status(409).json({
        error: project.launchState === 'LAUNCHED'
          ? 'This project already has a recorded launch state.'
          : 'This project has never been published, so there is no earlier launch to record.',
        launch: launch.launchSummary(project),
      });
    }
    if (req.body?.decision !== 'previously_launched') {
      return res.status(400).json({
        error: 'decision must be "previously_launched". To launch the project officially '
             + 'now, use Launch Project instead.',
      });
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        launchState: 'LAUNCHED',
        // launchedAt stays NULL on purpose. The project is launched; the date
        // is not known. Writing today's date would be a lie the history could
        // never be talked out of.
      },
      include: { launchedBy: { select: memberCardSelect() } },
    });

    logActivity({
      type: 'PROJECT_LAUNCH_CLASSIFIED',
      title: `Launch history recorded: ${project.title}`,
      description: 'Classified as launched before launch tracking existed; '
                 + 'no launch date is known and none was recorded.',
      actorId: req.user.id,
      actorName: req.user.name,
      metadata: { projectId: project.id, decision: 'previously_launched' },
    });

    res.json({
      message: 'Recorded as previously launched. No launch date was invented, no announcement '
             + 'was sent, and the Newly Launched badge was not started.',
      launch: launch.launchSummary(updated),
    });
  } catch (err) {
    console.error('classifyLaunch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── History (§9) ──────────────────────────────
/**
 * GET /projects/:id/announcements
 *
 * The announcement history, the live lifecycle state and everything the
 * composer needs to render itself, in one call - the panel opens with one
 * request rather than four.
 *
 * Recipient rows are aggregated, never listed: §10 and §13 both forbid
 * exposing who was mailed, and an admin needs the counts, not the addresses.
 * The one exception is `failures`, which carries the ERROR text with no
 * address attached - enough to tell "the mail server is down" from "fourteen
 * addresses do not exist" without naming anybody.
 */
const getHistory = async (req, res) => {
  try {
    const project = await findProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const announcements = await prisma.projectAnnouncement.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        admin: { select: memberCardSelect() },
        // Counts per status, not rows: a 2,000-recipient announcement must not
        // turn this response into a megabyte of email addresses.
        _count: { select: { recipients: true } },
      },
    });

    const ids = announcements.map((a) => a.id);
    const grouped = ids.length
      ? await prisma.projectAnnouncementRecipient.groupBy({
        by: ['announcementId', 'status'],
        where: { announcementId: { in: ids } },
        _count: { status: true },
      })
      : [];

    const counts = new Map();
    for (const row of grouped) {
      const entry = counts.get(row.announcementId) || {};
      entry[row.status] = row._count.status;
      counts.set(row.announcementId, entry);
    }

    const shaped = await Promise.all(announcements.map(async (a) => {
      const by = counts.get(a.id) || {};
      const sent = by.SENT || 0;
      const dead = by.DEAD || 0;
      const pending = (by.QUEUED || 0) + (by.SENDING || 0) + (by.FAILED || 0);

      // Distinct error messages for the rows that gave up. Capped, and with no
      // recipient attached.
      const failures = dead > 0
        ? (await prisma.projectAnnouncementRecipient.findMany({
          where: { announcementId: a.id, status: 'DEAD' },
          select: { lastError: true },
          distinct: ['lastError'],
          take: 5,
        })).map((row) => row.lastError).filter(Boolean)
        : [];

      return {
        ...a,
        admin: a.admin || null,
        adminName: a.admin?.name || a.adminName,
        email: {
          state: a.emailState,
          recipients: a._count.recipients,
          // Named `accepted`, not `delivered`: SMTP confirms acceptance by a
          // mail server and nothing more (§9, §10).
          accepted: sent,
          failed: dead,
          pending,
          failures,
          canRetry: dead > 0,
        },
        _count: undefined,
      };
    }));

    res.json({
      project: { id: project.id, title: project.title, status: project.status },
      launch: launch.launchSummary(project),
      announcements: shaped,
      options: composerOptions(project),
    });
  } catch (err) {
    console.error('getHistory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /projects/:id/announcements/:announcementId/retry
 *
 * Re-queue the recipients this announcement gave up on. Rows that were
 * accepted are not eligible and cannot be, so nobody receives a second copy
 * (§10, §14 "successful deliveries are not duplicated by retries").
 */
const retryAnnouncement = async (req, res) => {
  try {
    const announcement = await prisma.projectAnnouncement.findFirst({
      where: { id: req.params.announcementId, projectId: req.params.id },
    });
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

    const requeued = await worker.retryFailed(announcement.id);
    if (requeued > 0) worker.kick();

    logActivity({
      type: 'PROJECT_ANNOUNCEMENT_RETRIED',
      title: `Announcement retried: ${announcement.title}`,
      description: `${requeued} failed recipient(s) re-queued`,
      actorId: req.user.id,
      actorName: req.user.name,
      metadata: { projectId: req.params.id, announcementId: announcement.id, requeued },
    });

    res.json({
      message: requeued > 0
        ? `${requeued} failed recipient(s) re-queued. Email delivery is being processed.`
        : 'There are no failed recipients to retry for this announcement.',
      requeued,
    });
  } catch (err) {
    console.error('retryAnnouncement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  launchProject,
  majorUpdate,
  restartPromo,
  classifyLaunch,
  getHistory,
  retryAnnouncement,
};
