// services/notifier.js
//
// The one door every notification goes through. A call writes the in-portal
// Notification row (the bell) AND sends a Web Push to every device the user
// has subscribed, so the two can never disagree about what was said.
//
// Push is best-effort and never throws: a dead push service must not fail a
// signup, a launch or an investment request. The Notification row is the
// record; the push is the tap on the shoulder.
//
// Payloads carry a title, a one-line message and a link, never a balance,
// document or contact detail - a lock screen is public.

const webpush = require('web-push');
const prisma  = require('../utils/prismaClient');

const CHUNK = 500;

let configured = null;
function configure() {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[notifier] VAPID keys missing - push disabled, in-portal notifications still work');
    configured = false;
    return configured;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return configured;
}

const publicKey = () => process.env.VAPID_PUBLIC_KEY || null;

async function pushTo(userIds, payload) {
  if (!userIds.length || !configure()) return;
  const body = JSON.stringify(payload);
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const subs = await prisma.pushSubscription.findMany({
      where: { userId: { in: userIds.slice(i, i + CHUNK) } },
    });
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: 'high' },
        );
        await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
      } catch (err) {
        // 404/410: the browser unsubscribed or the app was removed. Forget it.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error('[notifier] push failed:', err.statusCode || err.message);
        }
      }
    }));
  }
}

/**
 * notify(userIds, { type, title, message, link, data })
 * Deduplicates ids, skips nobody silently: an empty list is a no-op.
 */
async function notify(userIds, { type, title, message, link = null, data = null }) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return { notified: 0 };

    for (let i = 0; i < ids.length; i += CHUNK) {
      await prisma.notification.createMany({
        data: ids.slice(i, i + CHUNK).map((userId) => ({
          userId, type, title, message: message.slice(0, 500), link, data: data || undefined,
        })),
      });
    }
    await pushTo(ids, { title, body: message.slice(0, 200), url: link || '/dashboard', tag: type, type });
    return { notified: ids.length };
  } catch (err) {
    console.error('[notifier] notify failed:', err.message);
    return { notified: 0, error: err.message };
  }
}

const idsOf = (rows) => rows.map((r) => r.id);

/** Every ADMIN and SUPER_ADMIN, optionally only super admins. */
async function adminIds({ superOnly = false, exclude = [] } = {}) {
  const rows = await prisma.user.findMany({
    where: { role: superOnly ? 'SUPER_ADMIN' : { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  return idsOf(rows).filter((id) => !exclude.includes(id));
}

/** Every ACTIVE user of any role - the "everyone" audience. */
async function everyoneIds() {
  return idsOf(await prisma.user.findMany({ where: { status: 'ACTIVE', deletedAt: null }, select: { id: true } }));
}

const notifyAdmins = async (payload, opts) => notify(await adminIds(opts), payload);
const notifyEveryone = async (payload, { exceptUserId } = {}) =>
  notify((await everyoneIds()).filter((id) => id !== exceptUserId), payload);

module.exports = { notify, notifyAdmins, notifyEveryone, adminIds, everyoneIds, publicKey };
