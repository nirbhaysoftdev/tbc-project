// src/services/projectLaunch.js
//
// Everything the lifecycle actions share: the launch-state rules, the
// "Newly Launched" window, who an announcement goes to, and the one
// transactional write that creates an announcement together with its outbox.
//
// It deliberately contains no Express and no mail: the controller decides who
// may act and what to answer, the worker does the sending, and this module is
// the rules. That split is what lets the tests drive a launch without a
// request or an SMTP server.
const prisma = require('../utils/prismaClient');
const { LIVE_USER } = require('../utils/roles');

/** The promotional window, in days. One place, because three screens show it. */
const PROMO_DAYS = 30;

/**
 * Who an announcement can be sent to.
 *
 * One audience today. It is still stored per announcement rather than assumed,
 * because the day a narrower audience is added, every history row written
 * before it would otherwise be ambiguous about who it actually reached.
 *
 * `where` is a User filter. ACTIVE only: a PENDING applicant has not been
 * approved, a FROZEN or REJECTED account must not be mailed, and `LIVE_USER`
 * keeps soft-deleted members out. Admins are included — they are members of
 * the community and do read the announcements.
 *
 * There is no "communication preferences" clause because this portal has no
 * such column. If one is added, it belongs here and nowhere else.
 */
const AUDIENCES = {
  ALL_ACTIVE_MEMBERS: {
    label: 'All active members',
    where: { ...LIVE_USER, status: 'ACTIVE' },
  },
};

const DEFAULT_AUDIENCE = 'ALL_ACTIVE_MEMBERS';

const isAudience = (value) => Object.prototype.hasOwnProperty.call(AUDIENCES, value);

/** The 30-day window as an absolute instant, from a given start. */
const promoEndFrom = (start) =>
  new Date(new Date(start).getTime() + PROMO_DAYS * 24 * 60 * 60 * 1000);

/**
 * The canonical member-facing URL for a project.
 *
 * `?id=` and not `/projects/<id>`: the frontend is a static export and cannot
 * pre-render a dynamic segment, so this query-string route is the real page.
 * FRONTEND_URL is the same variable the media stream's CSP uses — wrong in
 * production and these links point at localhost (see CLAUDE.md).
 */
const projectUrl = (projectId) => {
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/projects/detail?id=${encodeURIComponent(projectId)}`;
};

/** The in-portal link for a Notification row. Relative: the portal resolves it. */
const projectLink = (projectId) => `/projects/detail?id=${encodeURIComponent(projectId)}`;

/**
 * Is the "Newly Launched" badge showing right now?
 *
 * Derived from the stored expiry on every read, which is what §3 asks for: the
 * badge appears the instant the launch commits, disappears on its own when the
 * window passes, and there is no scheduled job that can fail and leave it
 * stuck on. The only clock involved is the server's.
 */
function badgeFor(project, now = new Date()) {
  const until = project?.newlyLaunchedUntil ? new Date(project.newlyLaunchedUntil) : null;
  const active = Boolean(until && until.getTime() > now.getTime());
  return {
    newlyLaunched: active,
    newlyLaunchedUntil: until ? until.toISOString() : null,
    // Rounded up, so the last partial day still reads as "1 day left" rather
    // than "0 days left" while the badge is visibly still there.
    newlyLaunchedDaysLeft: active
      ? Math.ceil((until.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : 0,
  };
}

/** A project status that may never be launched or announced. */
const BLOCKED_STATUSES = ['CANCELLED'];

/**
 * What an admin may do to this project right now.
 *
 * This is the single authority: the controller calls it before acting and the
 * API returns it so the UI can render the same answer. The buttons are drawn
 * from this, but the buttons are not what enforces it — every endpoint checks
 * again (§2, §13).
 */
function eligibility(project) {
  const blocked = BLOCKED_STATUSES.includes(project.status);
  const launched = project.launchState === 'LAUNCHED';
  const needsReview = project.launchState === 'PRE_FEATURE';

  // Enough of a project to announce: a name, a category and something to say
  // about it. Launching a row with no description would mail the community a
  // blank card.
  const complete = Boolean(
    project.title && project.title.trim()
    && project.category && project.category.trim()
    && project.description && project.description.trim(),
  );

  const reasons = [];
  if (blocked) reasons.push(`A ${project.status.toLowerCase()} project cannot be launched or announced.`);
  if (!complete) reasons.push('The project needs a name, a category and a description before it can be announced.');

  return {
    launchState: project.launchState,
    // Never launched, or published before this module existed and not yet
    // classified. Both are "no official launch on record", which is what makes
    // an official launch the right action.
    canLaunch: !blocked && complete && !launched,
    // Announcing a major update needs a launched project. It is the only
    // post-launch announcement there is - a project is launched once, and
    // after that the community is only told about something that changed.
    canAnnounce: !blocked && complete && launched,
    // Restarting the badge needs a launched project but not a complete one —
    // it sends nothing, so there is no blank card to worry about.
    canRestartPromo: !blocked && launched,
    // Only a PRE_FEATURE project can be classified, and only once.
    canClassify: needsReview,
    needsLaunchReview: needsReview,
    blocked,
    complete,
    reasons,
  };
}

/**
 * The lifecycle block every project payload carries.
 *
 * Status, official launch and promotional badge are three different things,
 * and §12 asks the UI to show them as three different things, so they come
 * back as three named groups rather than one muddled "state".
 */
function launchSummary(project, now = new Date()) {
  return {
    status: project.status,
    launchState: project.launchState,
    launchedAt: project.launchedAt ? new Date(project.launchedAt).toISOString() : null,
    launchedBy: project.launchedBy
      ? { id: project.launchedBy.id, name: project.launchedBy.name }
      : null,
    promoStartedAt: project.promoStartedAt ? new Date(project.promoStartedAt).toISOString() : null,
    promoRestartCount: project.promoRestartCount || 0,
    ...badgeFor(project, now),
    ...eligibility(project),
  };
}

/**
 * The recipients for one audience, as outbox rows.
 *
 * Addresses are snapshotted here and never read from the User row again: the
 * history has to say where the mail actually went, and a member who changes
 * their address next week must not rewrite that.
 *
 * De-duplicated case-insensitively on email. Two accounts sharing an address
 * is not supposed to happen (`users.email` is unique) but a single member must
 * receive one copy whatever the data says, and the unique index on
 * (announcementId, email) would reject the second row anyway.
 */
async function resolveRecipients(audience = DEFAULT_AUDIENCE) {
  const spec = AUDIENCES[audience] || AUDIENCES[DEFAULT_AUDIENCE];
  const users = await prisma.user.findMany({
    where: spec.where,
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  const seen = new Set();
  const rows = [];
  for (const user of users) {
    const email = (user.email || '').trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ userId: user.id, email, name: user.name || null });
  }
  return rows;
}

/**
 * The announcement types that actually send mail.
 *
 * Two, not three: a project is launched once, and the only post-launch
 * announcement is a major update, which has to say what changed. PROMO_RESTART
 * is absent because restarting the badge deliberately mails nobody (§7).
 */
const SENDING_TYPES = ['INITIAL_LAUNCH', 'MAJOR_UPDATE'];

/**
 * Write one announcement and its outbox, atomically, and apply whatever
 * project-level change belongs to it.
 *
 * WHY ONE TRANSACTION. §11 asks that a launch and the job that announces it
 * cannot silently diverge. Here they cannot: the announcement row, the
 * recipient rows and the project's launch columns all commit together or none
 * of them do. There is no in-memory job to lose, because the queue is the
 * recipient table — a crash one millisecond after the commit still has a
 * complete send list waiting on disk.
 *
 * WHY THE EMAIL IS NOT SENT HERE. A launch must survive a broken mail server
 * (§3), so nothing in this path talks to SMTP. The worker picks the rows up
 * afterwards and retries on its own schedule.
 *
 * Idempotency is the unique index on `idempotencyKey`. A retried request
 * collides, and the caller is handed the announcement that already exists.
 *
 * @returns {{ announcement: object, created: boolean }}
 */
async function createAnnouncement({
  project,
  type,
  idempotencyKey,
  title,
  message,
  detail = null,
  updateCategory = null,
  audience = DEFAULT_AUDIENCE,
  admin,
  /** Applied to the project row inside the same transaction. */
  projectData = null,
  promo = null,
}) {
  const existing = await prisma.projectAnnouncement.findUnique({
    where: { idempotencyKey },
    include: { project: { select: { id: true, title: true } } },
  });
  if (existing) return { announcement: existing, created: false };

  const recipients = SENDING_TYPES.includes(type)
    ? await resolveRecipients(audience)
    : [];

  try {
    const announcement = await prisma.$transaction(async (tx) => {
      if (projectData) {
        await tx.project.update({ where: { id: project.id }, data: projectData });
      }

      return tx.projectAnnouncement.create({
        data: {
          projectId: project.id,
          type,
          idempotencyKey,
          title,
          message,
          detail,
          updateCategory,
          audience,
          adminId: admin?.id || null,
          adminName: admin?.name || null,
          recipientCount: recipients.length,
          // An announcement with nobody to mail is COMPLETED, not PENDING: a
          // queue that will never move is not "pending". A promotional restart
          // is NOT_APPLICABLE, because it is not supposed to mail anyone.
          emailState: !SENDING_TYPES.includes(type)
            ? 'NOT_APPLICABLE'
            : (recipients.length === 0 ? 'COMPLETED' : 'PENDING'),
          promoStartedAt: promo?.startedAt || null,
          promoEndsAt: promo?.endsAt || null,
          promoReason: promo?.reason || null,
          ...(recipients.length > 0
            ? { recipients: { createMany: { data: recipients } } }
            : {}),
        },
      });
    });

    return { announcement, created: true };
  } catch (err) {
    // P2002 on `idempotencyKey`: two requests carrying the same key raced, and
    // the other one won. That is the retry case working exactly as intended,
    // so return its announcement rather than an error.
    if (err?.code === 'P2002') {
      const winner = await prisma.projectAnnouncement.findUnique({ where: { idempotencyKey } });
      if (winner) return { announcement: winner, created: false };
    }
    throw err;
  }
}

/** Notifications are inserted in chunks: one 5,000-row INSERT is not kind. */
const NOTIFY_CHUNK = 500;

/**
 * Publish the community announcement for an announcement row: one feed post,
 * plus a notification for every member in the audience.
 *
 * IDEMPOTENT ON `postId`. The announcement row is the lock: if it already
 * carries a post id, the announcement was already published and this returns
 * without writing anything. That is what stops a retried request — or a second
 * call from an operator retrying a failed launch — from putting the same
 * announcement in the feed twice (§4).
 *
 * Best-effort by design, and called after the launch has committed: a project
 * must stay launched even if this fails (§3). The failure is logged and the
 * announcement row keeps `postId` null, which the admin history shows as
 * "not published" rather than pretending.
 */
async function publishCommunityAnnouncement(announcement, project) {
  if (announcement.postId) return { created: false, postId: announcement.postId };

  const author = announcement.adminId;
  if (!author) {
    // Post.authorId is required and has a foreign key. Without an admin there
    // is nobody to attribute the post to, so skip rather than invent one.
    console.warn(`[launch] announcement ${announcement.id} has no admin; no community post made`);
    return { created: false, postId: null };
  }

  const url = projectUrl(project.id);
  const heading = announcement.title;
  const content = `${announcement.message.trim()}\n\n${url}`;

  try {
    const post = await prisma.post.create({
      data: {
        authorId: author,
        type: 'DEAL',
        title: heading,
        content,
      },
    });

    // Claim the post on the announcement immediately, before the (much
    // larger) notification writes. If the process dies between the two, the
    // feed has one post and a retry will not add a second — some members
    // missing an in-portal notification is a far smaller problem than the
    // community seeing the same announcement twice.
    await prisma.projectAnnouncement.update({
      where: { id: announcement.id },
      data: { postId: post.id },
    });

    const audience = AUDIENCES[announcement.audience] || AUDIENCES[DEFAULT_AUDIENCE];
    const members = await prisma.user.findMany({
      where: audience.where,
      select: { id: true },
    });

    const link = projectLink(project.id);
    let notified = 0;
    for (let i = 0; i < members.length; i += NOTIFY_CHUNK) {
      const chunk = members.slice(i, i + NOTIFY_CHUNK);
      const result = await prisma.notification.createMany({
        data: chunk.map((member) => ({
          userId: member.id,
          // PROJECT_LAUNCHED or PROJECT_UPDATE: the two things a member can be
          // told about a project. The member's notification list groups by
          // type, so "this is new" and "this changed" stay distinguishable.
          type: announcement.type === 'MAJOR_UPDATE' ? 'PROJECT_UPDATE' : 'PROJECT_LAUNCHED',
          title: heading,
          message: announcement.message.slice(0, 500),
          link,
          data: { projectId: project.id, announcementId: announcement.id, announcementType: announcement.type },
        })),
      });
      notified += result.count;
    }

    await prisma.projectAnnouncement.update({
      where: { id: announcement.id },
      data: { notifiedCount: notified },
    });

    return { created: true, postId: post.id, notified };
  } catch (err) {
    console.error(`[launch] community announcement failed for ${announcement.id}:`, err.message);
    return { created: false, postId: null, error: err.message };
  }
}

/** The default launch announcement message (§4). */
const defaultLaunchMessage = (project) =>
  `${project.title} is now live on the TBC Portal.\n\n`
  + `${(project.description || '').trim()}\n\n`
  + `Explore the project and discover the available details and opportunities.`;

/**
 * The categories offered for a major update (§6).
 *
 * Labels only — they are a tag on the announcement, not a behaviour, and an
 * unrecognised value is rejected rather than stored, so the history cannot
 * fill up with free text that no screen knows how to show.
 */
const UPDATE_CATEGORIES = {
  SCOPE: 'Change in project scope',
  FEATURES: 'New features or capabilities',
  TERMS: 'Revised investment or participation terms',
  FINANCIAL: 'Updated financial information',
  MILESTONE: 'New project milestone',
  PARTICIPATION: 'New participation opportunity',
  REDEVELOPMENT: 'Major redevelopment',
  OTHER: 'Other material change',
};

module.exports = {
  PROMO_DAYS,
  AUDIENCES,
  DEFAULT_AUDIENCE,
  UPDATE_CATEGORIES,
  SENDING_TYPES,
  isAudience,
  promoEndFrom,
  projectUrl,
  projectLink,
  badgeFor,
  eligibility,
  launchSummary,
  resolveRecipients,
  createAnnouncement,
  publishCommunityAnnouncement,
  defaultLaunchMessage,
};
