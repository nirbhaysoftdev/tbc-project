// controllers/pushController.js - a device opting in or out of Web Push.
const prisma   = require('../utils/prismaClient');
const notifier = require('../services/notifier');

const getPublicKey = (req, res) => {
  const key = notifier.publicKey();
  if (!key) return res.status(503).json({ error: 'Push notifications are not configured' });
  res.json({ publicKey: key });
};

const subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body?.subscription || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription' });
    }
    if (!/^https:\/\//.test(endpoint)) return res.status(400).json({ error: 'Invalid push endpoint' });

    // The endpoint is unique per browser. If this browser was last used by a
    // different member, the row moves to whoever is signed in now - otherwise
    // the previous member's alerts would keep arriving on this device.
    await prisma.pushSubscription.upsert({
      where:  { endpoint },
      create: { userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: (req.headers['user-agent'] || '').slice(0, 300) },
      update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
    });
    res.status(201).json({ subscribed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
    res.json({ subscribed: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getPublicKey, subscribe, unsubscribe };
