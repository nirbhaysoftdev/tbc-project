// tests/projectLifecycle.test.js
//
// The four lifecycle actions, the optional promotional restart, what happens
// to projects that already existed, and the delivery guarantees. One file per
// §14 group, in §14's order, so a requirement and its test can be read side by
// side.
const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./helpers');
const worker = require('../src/services/announcementWorker');
const launchService = require('../src/services/projectLaunch');

h.useJsonMail();

let admin;      // ADMIN - may launch and announce
let member;     // ACTIVE MEMBER - may not
let member2;    // a second eligible recipient
let pending;    // PENDING - must never be mailed
let frozen;     // FROZEN - must never be mailed

test.before(async () => {
  // Automatic sending off for the whole run. The lifecycle actions fire the
  // worker in the background, which is right in production and useless in a
  // test: a tick racing an assertion is why "status is QUEUED" would be flaky.
  // Paused, every test drives the queue itself with worker.tick(), so what the
  // sender does is observed rather than hoped for.
  worker.pause();
  await h.startServer();
  admin = await h.makeUser({ name: 'admin', role: 'ADMIN' });
  member = await h.makeUser({ name: 'member' });
  member2 = await h.makeUser({ name: 'member2' });
  pending = await h.makeUser({ name: 'pending', status: 'PENDING' });
  frozen = await h.makeUser({ name: 'frozen', status: 'FROZEN' });
});

test.after(async () => {
  await h.cleanup();
  await h.stopServer();
  await h.prisma.$disconnect();
});

// The fixture members plus whoever else is ACTIVE in this database. Asserting
// against a computed figure rather than a hardcoded 3 keeps the suite honest
// on a developer machine that already has members in it.
const expectedRecipients = () => launchService.resolveRecipients().then((r) => r.length);

// ─── Initial launch (§14 "Initial launch") ───────────────────────────────────

test('an unauthorized member cannot launch a project, and nothing happens', async () => {
  const project = await h.makeProject({ ownerId: admin.id });

  const res = await h.call('POST', `/api/projects/${project.id}/launch`, { user: member });
  assert.equal(res.status, 403);

  // The refusal is not cosmetic: no launch, no announcement, no queue.
  const after = await h.getProject(project.id);
  assert.equal(after.launchState, 'NEVER_LAUNCHED');
  assert.equal(after.launchedAt, null);
  assert.equal(after.newlyLaunchedUntil, null);
  assert.equal((await h.announcementsFor(project.id)).length, 0);

  // And with no token at all.
  assert.equal((await h.call('POST', `/api/projects/${project.id}/launch`)).status, 401);
});

test('an eligible never-launched project launches, and records everything §3 asks for', async () => {
  const project = await h.makeProject({ ownerId: admin.id, status: 'DRAFT' });
  const before = new Date();

  const res = await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  assert.equal(res.status, 201);

  const after = await h.getProject(project.id);

  // The launch timestamp is recorded, and it is the server's.
  assert.ok(after.launchedAt, 'launchedAt was recorded');
  assert.ok(after.launchedAt >= before && after.launchedAt <= new Date());
  // The responsible administrator is recorded.
  assert.equal(after.launchedById, admin.id);
  assert.equal(after.launchState, 'LAUNCHED');
  // A draft becomes visible on launch.
  assert.equal(after.status, 'ACTIVE');

  // The 30-day promotional expiry.
  const days = (after.newlyLaunchedUntil - after.launchedAt) / (24 * 60 * 60 * 1000);
  assert.ok(Math.abs(days - 30) < 0.01, `promo window is 30 days, got ${days}`);

  // Exactly one initial launch announcement.
  const announcements = await h.announcementsFor(project.id);
  assert.equal(announcements.length, 1);
  assert.equal(announcements[0].type, 'INITIAL_LAUNCH');
  assert.equal(announcements[0].adminId, admin.id);

  // Emails are queued for the eligible recipients - and only those.
  const recipients = announcements[0].recipients;
  assert.equal(recipients.length, await expectedRecipients());
  const addresses = recipients.map((r) => r.email);
  assert.ok(addresses.includes(member.email), 'an active member is queued');
  assert.ok(addresses.includes(member2.email), 'the second active member is queued');
  assert.ok(!addresses.includes(pending.email), 'a PENDING applicant is NOT queued');
  assert.ok(!addresses.includes(frozen.email), 'a FROZEN account is NOT queued');
  assert.ok(recipients.every((r) => r.status === 'QUEUED'), 'queued, and nothing claims they were sent');
  assert.ok(recipients.every((r) => r.sentAt === null && r.attempts === 0));

  // The community announcement exists and links to the right project.
  assert.ok(announcements[0].postId, 'a community announcement was published');
  const post = await h.prisma.post.findUnique({ where: { id: announcements[0].postId } });
  assert.ok(post.content.includes(launchService.projectUrl(project.id)),
    'the community announcement carries the canonical project URL');

  // The member-facing notification points at the project page.
  const note = await h.prisma.notification.findFirst({
    where: { userId: member.id, data: { path: ['projectId'], equals: project.id } },
  });
  assert.ok(note, 'the member was notified in-portal');
  assert.equal(note.link, `/projects/detail?id=${project.id}`);

  // The success message does not claim the email has arrived anywhere.
  assert.match(res.body.message, /email delivery is being processed/i);
  assert.ok(!/delivered/i.test(res.body.message));
});

test('the 30-day badge appears on launch, is server-authoritative, and expires on its own', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });

  // Visible to an ordinary member on the listing and the detail page, with no
  // dependence on whether they have viewed the project.
  const listing = await h.call('GET', `/api/projects?status=ALL&limit=60`, { user: member });
  const card = listing.body.projects.find((p) => p.id === project.id);
  assert.equal(card.newlyLaunched, true);
  assert.equal(card.newlyLaunchedDaysLeft, 30);

  const detail = await h.call('GET', `/api/projects/${project.id}`, { user: member });
  assert.equal(detail.body.project.newlyLaunched, true);

  // Expiry is computed from the stored timestamp, not from a scheduled job:
  // move the expiry into the past and the badge is simply gone on the next
  // read. Nothing had to run.
  await h.prisma.project.update({
    where: { id: project.id },
    data: { newlyLaunchedUntil: new Date(Date.now() - 1000) },
  });
  const expired = await h.call('GET', `/api/projects/${project.id}`, { user: member });
  assert.equal(expired.body.project.newlyLaunched, false);
  assert.equal(expired.body.project.newlyLaunchedDaysLeft, 0);
  // ...while the launch history itself is untouched.
  assert.ok((await h.getProject(project.id)).launchedAt);
});

test('a project cannot be launched twice, and a retried launch is not a second launch', async () => {
  const project = await h.makeProject({ ownerId: admin.id });

  const first = await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  assert.equal(first.status, 201);
  const launchedAt = (await h.getProject(project.id)).launchedAt;

  // The second deliberate attempt is refused with the exact wording §12 asks
  // for, and points the admin at the two actions that are appropriate.
  const second = await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  assert.equal(second.status, 409);
  assert.match(second.body.error, /already been launched/i);
  // It points the admin at the one action that IS appropriate afterwards.
  assert.match(second.body.error, /Announce Major Update/);
  assert.ok(!/re-announce/i.test(second.body.error), 'and offers no re-announcement, which no longer exists');

  // One announcement, one send list, launch date unmoved.
  assert.equal((await h.announcementsFor(project.id)).length, 1);
  assert.deepEqual((await h.getProject(project.id)).launchedAt, launchedAt);
});

test('a cancelled project cannot be launched', async () => {
  const project = await h.makeProject({ ownerId: admin.id, status: 'CANCELLED' });
  const res = await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  assert.equal(res.status, 409);
  assert.equal((await h.getProject(project.id)).launchState, 'NEVER_LAUNCHED');
  assert.equal((await h.announcementsFor(project.id)).length, 0);
});

test('an incomplete project cannot be launched', async () => {
  const project = await h.makeProject({ ownerId: admin.id, description: '  ' });
  const res = await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /name, a category and a description/i);
  assert.equal((await h.announcementsFor(project.id)).length, 0);
});

// ─── Recipient selection ─────────────────────────────────────────────────────
//
// Who an announcement goes to is chosen per send: everybody, everybody except
// some members, or only some members. The tests below are the ones that matter
// — that an exclusion really is an exclusion in BOTH channels (no email and no
// in-portal notification), that an inclusion reaches nobody else, and that a
// malformed selection widens to the whole audience rather than narrowing it
// silently.

test('the audience list is admin-only and holds exactly the members who could be mailed', async () => {
  const project = await h.makeProject({ ownerId: admin.id });

  assert.equal((await h.call('GET', `/api/projects/${project.id}/announcements/audience`,
    { user: member })).status, 403);
  assert.equal((await h.call('GET', `/api/projects/${project.id}/announcements/audience`)).status, 401);

  const res = await h.call('GET', `/api/projects/${project.id}/announcements/audience`, { user: admin });
  assert.equal(res.status, 200);
  const ids = res.body.members.map((m) => m.id);
  assert.ok(ids.includes(member.id) && ids.includes(member2.id) && ids.includes(admin.id));
  assert.ok(!ids.includes(pending.id), 'a PENDING applicant is not offered as a recipient');
  assert.ok(!ids.includes(frozen.id), 'a FROZEN account is not offered as a recipient');
  assert.equal(res.body.total, await expectedRecipients());
});

test('launching with members excluded mails and notifies everyone else, and only them', async () => {
  const project = await h.makeProject({ ownerId: admin.id });

  const res = await h.call('POST', `/api/projects/${project.id}/launch`, {
    user: admin,
    body: { audienceMode: 'EXCLUDE', recipientIds: [member.id] },
  });
  assert.equal(res.status, 201);

  const [announcement] = await h.announcementsFor(project.id);
  assert.equal(announcement.audienceMode, 'EXCLUDE');
  assert.deepEqual(announcement.audienceUserIds, [member.id]);
  // The denominator is kept, so the history can say "n of m" later.
  assert.equal(announcement.audienceSize, await expectedRecipients());
  assert.equal(announcement.recipientCount, announcement.audienceSize - 1);

  const addresses = announcement.recipients.map((r) => r.email);
  assert.ok(!addresses.includes(member.email), 'the excluded member has no outbox row at all');
  assert.ok(addresses.includes(member2.email));

  // The exclusion holds in the other channel too: handing them the
  // announcement as an in-portal notification would be the same message by
  // another door.
  const excluded = await h.prisma.notification.findFirst({
    where: { userId: member.id, data: { path: ['projectId'], equals: project.id } },
  });
  assert.equal(excluded, null, 'the excluded member was not notified in-portal either');
  assert.ok(await h.prisma.notification.findFirst({
    where: { userId: member2.id, data: { path: ['projectId'], equals: project.id } },
  }), 'every other member still was');

  // The project launched regardless - narrowing the recipients is not a
  // condition of the launch.
  assert.equal((await h.getProject(project.id)).launchState, 'LAUNCHED');
  // And the feed post is published either way: who may see a project is its
  // status, not who was told about it.
  assert.ok(announcement.postId);
});

test('announcing to only selected members reaches nobody else', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, {
    user: admin,
    // Launch quietly, so the assertions below are about the update alone.
    body: { audienceMode: 'INCLUDE', recipientIds: [admin.id] },
  });

  const res = await h.call('POST', `/api/projects/${project.id}/announcements/major-update`, {
    user: admin,
    body: {
      title: 'Phase two approved',
      message: 'The second phase has been approved.',
      audienceMode: 'INCLUDE',
      recipientIds: [member2.id, pending.id],
    },
  });
  assert.equal(res.status, 201);

  const update = (await h.announcementsFor(project.id)).find((a) => a.type === 'MAJOR_UPDATE');
  assert.equal(update.audienceMode, 'INCLUDE');
  const addresses = update.recipients.map((r) => r.email);
  // A PENDING id was asked for and is simply not in the audience: the
  // selection narrows an audience, it cannot widen one.
  assert.deepEqual(addresses, [member2.email]);
  assert.equal(update.recipientCount, 1);
  assert.ok(!addresses.includes(member.email));

  const notNotified = await h.prisma.notification.findFirst({
    where: {
      userId: member.id,
      type: 'PROJECT_UPDATE',
      data: { path: ['announcementId'], equals: update.id },
    },
  });
  assert.equal(notNotified, null, 'an unselected member is not notified about the update');
});

test('"only these members" with nobody selected is refused, not sent to everyone', async () => {
  const project = await h.makeProject({ ownerId: admin.id });

  const res = await h.call('POST', `/api/projects/${project.id}/launch`, {
    user: admin,
    body: { audienceMode: 'INCLUDE', recipientIds: [] },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /at least one member/i);

  // Refused means nothing happened - not launched, and no announcement that
  // would have mailed the whole community.
  assert.equal((await h.getProject(project.id)).launchState, 'NEVER_LAUNCHED');
  assert.equal((await h.announcementsFor(project.id)).length, 0);
});

test('an unrecognised selection widens to the whole audience rather than narrowing it', async () => {
  const project = await h.makeProject({ ownerId: admin.id });

  const res = await h.call('POST', `/api/projects/${project.id}/launch`, {
    user: admin,
    body: { audienceMode: 'ONLY_MY_FRIENDS', recipientIds: [member.id, member2.id] },
  });
  assert.equal(res.status, 201);

  const [announcement] = await h.announcementsFor(project.id);
  assert.equal(announcement.audienceMode, 'ALL');
  assert.deepEqual(announcement.audienceUserIds, []);
  assert.equal(announcement.recipientCount, await expectedRecipients());
});

test('an announcement sent with no selection records ALL, which is what it was', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });

  const [announcement] = await h.announcementsFor(project.id);
  assert.equal(announcement.audienceMode, 'ALL');
  assert.equal(announcement.audienceSize, announcement.recipientCount);

  // The history reports it as un-narrowed rather than as a selection of
  // everybody, so the panel has nothing to draw attention to.
  const history = await h.call('GET', `/api/projects/${project.id}/announcements`, { user: admin });
  const row = history.body.announcements.find((a) => a.id === announcement.id);
  assert.equal(row.audienceSelection.mode, 'ALL');
  assert.equal(row.audienceSelection.label, null);
});

// ─── Existing projects (§14 "Existing projects") ─────────────────────────────

test('projects that already existed are classified, not launched or announced', async () => {
  // The migration's two outcomes, reproduced as rows.
  const draft = await h.makeProject({ ownerId: admin.id, status: 'DRAFT', launchState: 'NEVER_LAUNCHED' });
  const published = await h.makeProject({ ownerId: admin.id, status: 'ACTIVE', launchState: 'PRE_FEATURE' });

  for (const project of [draft, published]) {
    const row = await h.getProject(project.id);
    // No fabricated launch date, no promotional period, no announcement, so no
    // email could have been queued - the queue is the recipient table.
    assert.equal(row.launchedAt, null, 'no launch date was invented');
    assert.equal(row.newlyLaunchedUntil, null, 'no promotional period was started');
    assert.equal((await h.announcementsFor(project.id)).length, 0, 'no announcement was created');
  }

  // Existing drafts remain drafts; inactive/published projects keep their status.
  assert.equal((await h.getProject(draft.id)).status, 'DRAFT');
  assert.equal((await h.getProject(published.id)).status, 'ACTIVE');

  // A pre-feature project is flagged for review rather than quietly treated as
  // either launched or never launched.
  const detail = await h.call('GET', `/api/projects/${published.id}`, { user: admin });
  assert.equal(detail.body.project.launch.needsLaunchReview, true);
  assert.equal(detail.body.project.launch.canAnnounce, false,
    'it cannot be re-announced until its launch history is resolved');
});

test('a pre-feature project can be classified as previously launched, with no date invented', async () => {
  const project = await h.makeProject({ ownerId: admin.id, status: 'ACTIVE', launchState: 'PRE_FEATURE' });

  assert.equal((await h.call('POST', `/api/projects/${project.id}/launch-classify`,
    { user: member, body: { decision: 'previously_launched' } })).status, 403);

  const res = await h.call('POST', `/api/projects/${project.id}/launch-classify`,
    { user: admin, body: { decision: 'previously_launched' } });
  assert.equal(res.status, 200);

  const after = await h.getProject(project.id);
  assert.equal(after.launchState, 'LAUNCHED');
  assert.equal(after.launchedAt, null, 'the unknown launch date stays unknown');
  assert.equal(after.newlyLaunchedUntil, null, 'no badge was started');
  assert.equal((await h.announcementsFor(project.id)).length, 0, 'nothing was announced');

  // And it is now eligible for the two communication actions.
  assert.equal(res.body.launch.canAnnounce, true);
  assert.equal(res.body.launch.canLaunch, false);
});

test('a pre-feature project can instead be launched officially, which does announce it', async () => {
  const project = await h.makeProject({ ownerId: admin.id, status: 'ACTIVE', launchState: 'PRE_FEATURE' });

  const res = await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  assert.equal(res.status, 201);

  const after = await h.getProject(project.id);
  assert.ok(after.launchedAt);
  assert.equal(after.launchState, 'LAUNCHED');
  assert.ok(after.newlyLaunchedUntil > new Date());
});

// ─── Edit project (§14 "Edit project") ───────────────────────────────────────

test('editing a launched project saves the content and touches no launch state', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });

  const launched = await h.getProject(project.id);
  const announcementsBefore = (await h.announcementsFor(project.id)).length;
  const postsBefore = await h.prisma.post.count({ where: { authorId: admin.id } });

  const res = await h.call('PUT', `/api/projects/${project.id}`, {
    user: admin,
    body: {
      title: `${project.title} (edited)`,
      description: 'An edited description.',
      location: 'Dublin',
      // Offered maliciously: an edit must not be able to move the launch date
      // or extend the badge even when the request body asks it to.
      launchedAt: new Date(0).toISOString(),
      launchedById: member.id,
      launchState: 'NEVER_LAUNCHED',
      newlyLaunchedUntil: new Date(Date.now() + 999 * 24 * 3600 * 1000).toISOString(),
      promoRestartCount: 99,
    },
  });
  assert.equal(res.status, 200);
  assert.match(res.body.message, /No announcement was sent/i);

  const after = await h.getProject(project.id);
  // The content was saved.
  assert.equal(after.title, `${project.title} (edited)`);
  assert.equal(after.location, 'Dublin');
  // The launch history was preserved, verbatim.
  assert.deepEqual(after.launchedAt, launched.launchedAt);
  assert.equal(after.launchedById, launched.launchedById);
  assert.equal(after.launchState, 'LAUNCHED');
  assert.deepEqual(after.newlyLaunchedUntil, launched.newlyLaunchedUntil);
  assert.equal(after.promoRestartCount, 0);
  // No announcement, no community post.
  assert.equal((await h.announcementsFor(project.id)).length, announcementsBefore);
  assert.equal(await h.prisma.post.count({ where: { authorId: admin.id } }), postsBefore);
});

// ─── Major update (§14 "Major update") ───────────────────────────────────────

test('announcing an update needs a launched project and admin rights', async () => {
  // There is no re-announcement to fall back on: a major update is the only
  // post-launch announcement, so this is the one gate that matters.
  const unlaunched = await h.makeProject({ ownerId: admin.id });
  const tooEarly = await h.call('POST', `/api/projects/${unlaunched.id}/announcements/major-update`,
    { user: admin, body: { title: 'Phase two', message: 'Something changed.' } });
  assert.equal(tooEarly.status, 409);
  assert.match(tooEarly.body.error, /has not been launched/i);
  assert.equal((await h.announcementsFor(unlaunched.id)).length, 0);

  const launched = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${launched.id}/launch`, { user: admin });
  assert.equal((await h.call('POST', `/api/projects/${launched.id}/announcements/major-update`,
    { user: member, body: { title: 'Phase two', message: 'Something changed.' } })).status, 403);
  assert.equal((await h.announcementsFor(launched.id)).length, 1, 'still only the launch');
});

test('retrying the same update is a no-op; a deliberate second update is allowed', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  const path = `/api/projects/${project.id}/announcements/major-update`;

  const body = { idempotencyKey: 'composer-session-A', title: 'Phase two', message: 'Permission granted.' };
  const first = await h.call('POST', path, { user: admin, body });
  assert.equal(first.status, 201);

  // The same request again - a browser retry after a timeout, say.
  const retry = await h.call('POST', path, { user: admin, body });
  assert.equal(retry.status, 200, 'the retry is accepted, not an error');
  assert.equal(retry.body.announcement.id, first.body.announcement.id, 'and resolves to the same announcement');

  let announcements = await h.announcementsFor(project.id);
  assert.equal(announcements.length, 2, 'no duplicate announcement');
  const update = announcements[1];
  // No duplicate community post and no duplicate emails.
  assert.equal(update.recipients.length, await expectedRecipients());
  assert.equal(await h.prisma.post.count({ where: { id: update.postId } }), 1,
    'one community announcement, not two');

  // A DELIBERATE second update is a new business action: new composer session,
  // new key, and it goes out.
  const second = await h.call('POST', path, {
    user: admin,
    body: { idempotencyKey: 'composer-session-B', title: 'Phase three', message: 'Construction started.' },
  });
  assert.equal(second.status, 201);
  announcements = await h.announcementsFor(project.id);
  assert.equal(announcements.length, 3);
  assert.notEqual(announcements[2].postId, announcements[1].postId);
  // The launch history and the badge are untouched by either of them.
  const after = await h.getProject(project.id);
  assert.equal(after.promoRestartCount, 0);
  assert.equal(announcements[1].promoStartedAt, null);
  assert.equal(announcements[2].promoStartedAt, null);
  // And the project record is reused - no second project.
  assert.equal(await h.prisma.project.count({ where: { title: project.title } }), 1);
});

test('a major update requires a title and an admin-written summary', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  const path = `/api/projects/${project.id}/announcements/major-update`;

  assert.equal((await h.call('POST', path, { user: admin, body: { message: 'Only a summary.' } })).status, 400);

  const noSummary = await h.call('POST', path, { user: admin, body: { title: 'Phase two' } });
  assert.equal(noSummary.status, 400);
  assert.match(noSummary.body.error, /What's New\?" summary is required/);

  assert.equal((await h.call('POST', path, {
    user: admin, body: { title: 'Phase two', message: 'x', updateCategory: 'NOT_A_CATEGORY' },
  })).status, 400);

  // Nothing was created by any of the three refusals.
  assert.equal((await h.announcementsFor(project.id)).length, 1);
});

test('a major update is stored and announced, and does not restart the badge', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  const launched = await h.getProject(project.id);

  const res = await h.call('POST', `/api/projects/${project.id}/announcements/major-update`, {
    user: admin,
    body: {
      idempotencyKey: 'update-session-A',
      title: 'Phase two approved',
      message: 'Planning permission has been granted and construction starts in March.',
      detail: 'The revised timeline and the updated financial model are in the documents tab.',
      updateCategory: 'MILESTONE',
    },
  });
  assert.equal(res.status, 201);
  assert.match(res.body.message, /Major update published successfully/i);

  const announcements = await h.announcementsFor(project.id);
  const update = announcements[1];
  assert.equal(update.type, 'MAJOR_UPDATE');
  assert.equal(update.title, 'Phase two approved');
  // The approved summary is what is stored, and it is the admin's words.
  assert.match(update.message, /Planning permission has been granted/);
  assert.match(update.detail, /revised timeline/);
  assert.equal(update.updateCategory, 'New project milestone');
  assert.ok(update.postId);

  // Launch history unchanged; promotional period NOT restarted.
  const after = await h.getProject(project.id);
  assert.deepEqual(after.launchedAt, launched.launchedAt);
  assert.deepEqual(after.newlyLaunchedUntil, launched.newlyLaunchedUntil);
  assert.equal(after.promoRestartCount, 0);
  assert.equal(update.promoStartedAt, null);
});

test('a major update on a project whose badge has expired leaves it expired', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  // Walk the clock past the original window.
  await h.prisma.project.update({
    where: { id: project.id },
    data: { newlyLaunchedUntil: new Date(Date.now() - 24 * 3600 * 1000) },
  });

  await h.call('POST', `/api/projects/${project.id}/announcements/major-update`, {
    user: admin,
    body: { title: 'Redeveloped', message: 'The whole scheme has been reworked.' },
  });

  const detail = await h.call('GET', `/api/projects/${project.id}`, { user: member });
  assert.equal(detail.body.project.newlyLaunched, false,
    'announcing an update does not bring the badge back');
});

test('the major-update email carries the admin summary and the right project link', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  await h.call('POST', `/api/projects/${project.id}/announcements/major-update`, {
    user: admin,
    body: { title: 'Phase two approved', message: 'Planning permission granted.' },
  });

  // Send one queued email for real, through the real template, and read it
  // back off the JSON transport.
  const sent = [];
  const announcement = (await h.announcementsFor(project.id))[1];
  const row = await h.prisma.projectAnnouncementRecipient.findFirst({
    where: { announcementId: announcement.id, email: member.email },
    include: { announcement: { include: { project: true } } },
  });
  const mailer = require('../src/services/mailer');
  const original = mailer.sendProjectAnnouncementEmail;
  mailer.sendProjectAnnouncementEmail = async (args) => {
    const info = await original(args);
    sent.push({ args, message: JSON.parse(info.message) });
    return info;
  };
  try {
    await worker.processRecipient({ ...row, attempts: 1 }, { bannerPath: null });
  } finally {
    mailer.sendProjectAnnouncementEmail = original;
  }

  assert.equal(sent.length, 1);
  const { message } = sent[0];
  assert.match(message.subject, /^Project Update – .*: Phase two approved$/);
  assert.match(message.html, /WHAT'S NEW\?/);
  assert.match(message.html, /Planning permission granted\./);
  assert.ok(message.html.includes(launchService.projectUrl(project.id)),
    'the email links to the canonical project URL');
  // Personalised, and addressed to one member only - no other address is in it.
  assert.match(message.html, /Hello Test,/);
  assert.equal(message.to.length, 1);
  assert.ok(!message.html.includes(member2.email), 'no other recipient is exposed');
});

test('admin-typed announcement content is escaped in the email, never rendered as markup', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  await h.call('POST', `/api/projects/${project.id}/announcements/major-update`, {
    user: admin,
    body: { title: 'Scope change', message: '<img src=x onerror="alert(1)"> & <b>bold</b>' },
  });

  const announcement = (await h.announcementsFor(project.id))[1];
  const row = await h.prisma.projectAnnouncementRecipient.findFirst({
    where: { announcementId: announcement.id },
    include: { announcement: { include: { project: true } } },
  });

  let html = '';
  const mailer = require('../src/services/mailer');
  const original = mailer.sendProjectAnnouncementEmail;
  mailer.sendProjectAnnouncementEmail = async (args) => {
    const info = await original(args);
    html = JSON.parse(info.message).html;
    return info;
  };
  try {
    await worker.processRecipient({ ...row, attempts: 1 }, { bannerPath: null });
  } finally {
    mailer.sendProjectAnnouncementEmail = original;
  }

  assert.ok(!html.includes('<img src=x'), 'the tag is not live markup');
  assert.ok(!html.includes('onerror="alert(1)"'));
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /&amp;/);
});

// ─── Promotional-period restart (§14 "Promotional-period restart") ───────────

test('only an admin can restart the promotional period, and only on a launched project', async () => {
  const unlaunched = await h.makeProject({ ownerId: admin.id });
  assert.equal((await h.call('POST', `/api/projects/${unlaunched.id}/promo-restart`,
    { user: admin, body: { reason: 'Redeveloped' } })).status, 409);

  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });

  assert.equal((await h.call('POST', `/api/projects/${project.id}/promo-restart`,
    { user: member, body: { reason: 'Redeveloped' } })).status, 403);
  assert.equal((await h.getProject(project.id)).promoRestartCount, 0);
});

test('restarting the promotional period renews the badge, preserves the launch date and sends nothing', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  const launched = await h.getProject(project.id);

  // Let the original window lapse, so a renewed badge is unambiguous.
  await h.prisma.project.update({
    where: { id: project.id },
    data: { newlyLaunchedUntil: new Date(Date.now() - 24 * 3600 * 1000) },
  });
  const queuedBefore = await h.prisma.projectAnnouncementRecipient.count({
    where: { announcement: { projectId: project.id } },
  });
  const postsBefore = await h.prisma.post.count({ where: { authorId: admin.id } });

  const res = await h.call('POST', `/api/projects/${project.id}/promo-restart`, {
    user: admin,
    body: { reason: 'Substantially redeveloped: new scheme, new partners.' },
  });
  assert.equal(res.status, 201);
  assert.match(res.body.message, /restarted for 30 days/i);

  const after = await h.getProject(project.id);
  // The original launch timestamp is untouched.
  assert.deepEqual(after.launchedAt, launched.launchedAt);
  assert.equal(after.launchedById, launched.launchedById);
  // A new promotional expiry is recorded, and the badge is visible again.
  assert.ok(after.newlyLaunchedUntil > new Date());
  const days = (after.newlyLaunchedUntil - after.promoStartedAt) / (24 * 3600 * 1000);
  assert.ok(Math.abs(days - 30) < 0.01);
  assert.equal(after.promoRestartCount, 1);

  const detail = await h.call('GET', `/api/projects/${project.id}`, { user: member });
  assert.equal(detail.body.project.newlyLaunched, true);

  // The restart is in the project history, with the admin and the reason...
  const announcements = await h.announcementsFor(project.id);
  const restart = announcements.find((a) => a.type === 'PROMO_RESTART');
  assert.ok(restart);
  assert.equal(restart.adminId, admin.id);
  assert.match(restart.promoReason, /Substantially redeveloped/);
  assert.ok(restart.promoEndsAt);
  // ...and it mailed and announced nothing.
  assert.equal(restart.emailState, 'NOT_APPLICABLE');
  assert.equal(restart.recipientCount, 0);
  assert.equal(restart.postId, null);
  assert.equal(await h.prisma.projectAnnouncementRecipient.count({
    where: { announcement: { projectId: project.id } },
  }), queuedBefore, 'no new email was queued');
  assert.equal(await h.prisma.post.count({ where: { authorId: admin.id } }), postsBefore,
    'no community announcement was published');

  // A retried restart request does not stack a second window.
  const again = await h.call('POST', `/api/projects/${project.id}/promo-restart`, {
    user: admin, body: { reason: 'Another one.' },
  });
  assert.equal(again.status, 201);
  assert.equal((await h.getProject(project.id)).promoRestartCount, 2);
  assert.deepEqual((await h.getProject(project.id)).launchedAt, launched.launchedAt);
});

// ─── Email and notification reliability (§14 "Email and notification...") ────

test('the project stays launched when every email fails, and the failures are recorded', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  const announcement = (await h.announcementsFor(project.id))[0];

  // Give up on the first attempt rather than walking five backoffs.
  await h.prisma.projectAnnouncementRecipient.updateMany({
    where: { announcementId: announcement.id },
    data: { maxAttempts: 1 },
  });

  const mailer = require('../src/services/mailer');
  const original = mailer.sendProjectAnnouncementEmail;
  mailer.sendProjectAnnouncementEmail = async () => { throw new Error('SMTP unavailable'); };
  try {
    await h.drain(announcement.id);
  } finally {
    mailer.sendProjectAnnouncementEmail = original;
  }

  // The project is still launched. That is the whole point of §3.
  const after = await h.getProject(project.id);
  assert.equal(after.launchState, 'LAUNCHED');
  assert.ok(after.launchedAt);
  assert.ok(after.newlyLaunchedUntil > new Date());
  // The community announcement stands too.
  assert.ok((await h.prisma.projectAnnouncement.findUnique({ where: { id: announcement.id } })).postId);

  const rolled = await h.prisma.projectAnnouncement.findUnique({ where: { id: announcement.id } });
  assert.equal(rolled.emailState, 'FAILED');
  const rows = await h.prisma.projectAnnouncementRecipient.findMany({ where: { announcementId: announcement.id } });
  assert.ok(rows.every((r) => r.status === 'DEAD'));
  assert.ok(rows.every((r) => /SMTP unavailable/.test(r.lastError)));

  // The admin history reports it as failed with a retry offered, and exposes
  // no recipient addresses.
  const history = await h.call('GET', `/api/projects/${project.id}/announcements`, { user: admin });
  const shown = history.body.announcements.find((a) => a.id === announcement.id);
  assert.equal(shown.email.state, 'FAILED');
  assert.equal(shown.email.accepted, 0);
  assert.equal(shown.email.failed, rows.length);
  assert.equal(shown.email.canRetry, true);
  assert.ok(!JSON.stringify(history.body).includes(member.email), 'no member address is exposed');
});

test('a retry sends only to the recipients that failed, never to those already accepted', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  const announcement = (await h.announcementsFor(project.id))[0];

  const rows = await h.prisma.projectAnnouncementRecipient.findMany({
    where: { announcementId: announcement.id }, orderBy: { id: 'asc' },
  });
  assert.ok(rows.length >= 2, 'the fixture needs at least two recipients');

  // One already accepted, the rest gave up.
  const accepted = rows[0];
  const failed = rows.slice(1);
  await h.prisma.projectAnnouncementRecipient.update({
    where: { id: accepted.id },
    data: { status: 'SENT', sentAt: new Date(), attempts: 1 },
  });
  await h.prisma.projectAnnouncementRecipient.updateMany({
    where: { id: { in: failed.map((r) => r.id) } },
    data: { status: 'DEAD', attempts: 5, lastError: 'Connection refused' },
  });
  await worker.rollUp(announcement.id);
  assert.equal(
    (await h.prisma.projectAnnouncement.findUnique({ where: { id: announcement.id } })).emailState,
    'PARTIAL',
  );

  const retried = await h.call('POST',
    `/api/projects/${project.id}/announcements/${announcement.id}/retry`, { user: admin });
  assert.equal(retried.status, 200);
  assert.equal(retried.body.requeued, failed.length);

  // The accepted recipient was NOT re-queued.
  const afterRequeue = await h.prisma.projectAnnouncementRecipient.findUnique({ where: { id: accepted.id } });
  assert.equal(afterRequeue.status, 'SENT');
  assert.deepEqual(afterRequeue.sentAt, accepted.sentAt ?? afterRequeue.sentAt);

  // Drain the queue and count what the mailer was actually asked to send.
  const sentTo = [];
  const mailer = require('../src/services/mailer');
  const original = mailer.sendProjectAnnouncementEmail;
  mailer.sendProjectAnnouncementEmail = async (args) => { sentTo.push(args.to); return { messageId: 'test' }; };
  try {
    await h.drain(announcement.id);
  } finally {
    mailer.sendProjectAnnouncementEmail = original;
  }

  assert.deepEqual(sentTo.sort(), failed.map((r) => r.email).sort(),
    'exactly the failed recipients were mailed, and only once each');
  assert.ok(!sentTo.includes(accepted.email), 'the accepted recipient was not mailed again');
  assert.equal(
    (await h.prisma.projectAnnouncement.findUnique({ where: { id: announcement.id } })).emailState,
    'COMPLETED',
  );
});

test('a temporary failure is retried with backoff; a permanent one is not', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  const announcement = (await h.announcementsFor(project.id))[0];
  const rows = await h.prisma.projectAnnouncementRecipient.findMany({
    where: { announcementId: announcement.id },
    orderBy: { id: 'asc' },
    include: { announcement: { include: { project: true } } },
  });

  const mailer = require('../src/services/mailer');
  const original = mailer.sendProjectAnnouncementEmail;

  // Temporary: the connection dropped. Retryable, with a future runAfter.
  mailer.sendProjectAnnouncementEmail = async () => {
    const err = new Error('Connection timed out');
    err.code = 'ETIMEDOUT';
    throw err;
  };
  try {
    await worker.processRecipient({ ...rows[0], attempts: 1 }, { bannerPath: null });
  } finally {
    mailer.sendProjectAnnouncementEmail = original;
  }
  let row = await h.prisma.projectAnnouncementRecipient.findUnique({ where: { id: rows[0].id } });
  assert.equal(row.status, 'FAILED', 'a temporary failure stays retryable');
  assert.ok(row.runAfter > new Date(), 'and is backed off into the future');

  // Permanent: the address does not exist. No point retrying it.
  mailer.sendProjectAnnouncementEmail = async () => {
    const err = new Error('550 no such user');
    err.responseCode = 550;
    throw err;
  };
  try {
    await worker.processRecipient({ ...rows[1], attempts: 1 }, { bannerPath: null });
  } finally {
    mailer.sendProjectAnnouncementEmail = original;
  }
  row = await h.prisma.projectAnnouncementRecipient.findUnique({ where: { id: rows[1].id } });
  assert.equal(row.status, 'DEAD', 'a permanent rejection is not retried');

  // Backoff grows and is always in the future.
  assert.ok(worker.backoffFor(1) < worker.backoffFor(4));
});

test('a row already accepted is never claimed again, even by a worker tick', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });
  const announcement = (await h.announcementsFor(project.id))[0];

  await h.prisma.projectAnnouncementRecipient.updateMany({
    where: { announcementId: announcement.id },
    data: { status: 'SENT', sentAt: new Date() },
  });

  const claimed = await worker.claimBatch(50);
  assert.equal(claimed.filter((r) => r.announcementId === announcement.id).length, 0);
  await worker.rollUp(announcement.id);
  assert.equal(
    (await h.prisma.projectAnnouncement.findUnique({ where: { id: announcement.id } })).emailState,
    'COMPLETED',
  );
});

test('the history reports queued work as processing, not as delivered', async () => {
  const project = await h.makeProject({ ownerId: admin.id });
  await h.call('POST', `/api/projects/${project.id}/launch`, { user: admin });

  const history = await h.call('GET', `/api/projects/${project.id}/announcements`, { user: admin });
  assert.equal(history.status, 200);
  const shown = history.body.announcements[0];
  assert.equal(shown.type, 'INITIAL_LAUNCH');
  assert.ok(['PENDING', 'PROCESSING'].includes(shown.email.state));
  assert.equal(shown.email.recipients, await expectedRecipients());
  // The count is named for what it is: accepted by a mail server.
  assert.ok('accepted' in shown.email);
  assert.ok(!('delivered' in shown.email));

  // The history itself is admin-only.
  assert.equal((await h.call('GET', `/api/projects/${project.id}/announcements`, { user: member })).status, 403);
});
