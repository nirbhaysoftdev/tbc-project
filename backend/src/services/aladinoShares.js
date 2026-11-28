// src/services/aladinoShares.js
//
// The share offerings (/aladino-shares, /real-estate-shares): public pages where
// anyone with the link can reserve shares, plus one small admin of its own that
// sees every offering. Each offering has its own settings row and its own share
// pool; a booking records which offering (which page) it came from.
//
// It is standalone on purpose. Nothing here reads `users` or the portal's
// sessions, and the admin login below is not a portal login: it is one
// hardcoded account, and the token it issues is useless
// against every other endpoint.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prismaClient');

// The offerings. The key is the settings row id and `aladino_share_bookings.offering`.
// `defaults` only seeds a missing settings row; the migration inserts both rows.
const OFFERINGS = {
  aladino: { label: 'Aladino', defaults: { totalShares: 600, pricePerShare: 5000, valuation: 38000000 } },
  'real-estate': { label: 'Real estate', defaults: { totalShares: 350, pricePerShare: 10000, valuation: 3500000 } },
};
const DEFAULT_OFFERING = 'aladino';
/** Anything that is not a known offering is the Aladino page, as before. */
const offeringOf = (v) => (Object.prototype.hasOwnProperty.call(OFFERINGS, v) ? v : DEFAULT_OFFERING);
const SCOPE = 'aladino-shares-admin';
const SESSION = '12h';
// One number for pg_advisory_xact_lock. Serialises bookings and total changes so
// two people reserving the last shares at once cannot both succeed.
const LOCK_KEY = 71400128;

class ShareError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

/* ── State ─────────────────────────────────────── */

async function settingsOf(db, offering) {
  return (await db.aladinoShareSettings.findUnique({ where: { id: offering } }))
    || db.aladinoShareSettings.create({ data: { id: offering, ...OFFERINGS[offering].defaults } });
}

async function bookedOf(db, offering) {
  const r = await db.aladinoShareBooking.aggregate({
    where: { offering, status: 'ACTIVE' }, _sum: { shares: true },
  });
  return r._sum.shares || 0;
}

const shape = (s, booked) => ({
  offering: s.id,
  visible: s.visible,
  allowLookup: s.allowLookup,
  totalShares: s.totalShares,
  bookedShares: booked,
  availableShares: Math.max(0, s.totalShares - booked),
  pricePerShare: s.pricePerShare,
  valuation: s.valuation,
});

async function publicState(offeringIn) {
  const offering = offeringOf(offeringIn);
  const [s, booked] = [await settingsOf(prisma, offering), await bookedOf(prisma, offering)];
  return shape(s, booked);
}

/* ── Visitors ──────────────────────────────────── */

async function book(body) {
  const offering = offeringOf(body.offering);
  const name = clean(body.name, 120);
  const email = clean(body.email, 160).toLowerCase();
  const shares = Number(body.shares);
  if (name.length < 2) throw new ShareError(400, 'Please enter your full name.');
  if (!EMAIL_RE.test(email)) throw new ShareError(400, 'Please enter a valid email.');
  if (!Number.isInteger(shares) || shares < 1 || shares > 1_000_000) {
    throw new ShareError(400, 'Please enter a whole number of shares (min. 1).');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
    const s = await settingsOf(tx, offering);
    if (!s.visible) throw new ShareError(403, 'The offering is currently closed.');
    const booked = await bookedOf(tx, offering);
    const available = Math.max(0, s.totalShares - booked);
    if (shares > available) {
      throw new ShareError(409,
        available === 0 ? 'All shares have been booked.' : `Only ${available} shares are still available.`,
        { state: shape(s, booked) });
    }
    const row = await tx.aladinoShareBooking.create({ data: { offering, name, email, shares } });
    return {
      ok: true,
      booking: { id: row.id, name, shares, amount: shares * s.pricePerShare },
      state: shape(s, booked + shares),
    };
  });
}

/** A visitor's own bookings, found by the email they booked with. Nobody
 *  else's row is ever returned. */
async function myBookings(emailIn, offeringIn) {
  const offering = offeringOf(offeringIn);
  const email = clean(emailIn, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ShareError(400, 'Please enter a valid email.');
  const s = await settingsOf(prisma, offering);
  if (!s.visible || !s.allowLookup) throw new ShareError(403, 'Booking lookup is currently disabled.');
  const rows = await prisma.aladinoShareBooking.findMany({ where: { offering, email }, orderBy: { createdAt: 'asc' } });
  return {
    bookings: rows.map((b) => ({
      shares: b.shares,
      amount: b.shares * s.pricePerShare,
      stakePct: ((b.shares * s.pricePerShare) / s.valuation) * 100,
      createdAt: b.createdAt,
      status: b.status.toLowerCase(),
    })),
  };
}

/* ── Admin ─────────────────────────────────────── */

const safeEqual = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(String(a)).digest(),
  crypto.createHash('sha256').update(String(b)).digest(),
);

// The single admin account, hardcoded as it was in the original share portal.
// Only a scrypt hash ("salt:hash") is stored, never the password. To change it:
//   node -e 'const c=require("crypto");const s=c.randomBytes(16).toString("hex");console.log(s+":"+c.scryptSync(process.argv[1],s,32).toString("hex"))' 'NEW_PASSWORD'
// ALADINO_SHARES_ADMIN_EMAIL / ALADINO_SHARES_ADMIN_HASH override these when set.
const ADMIN_EMAIL = 'nirbhay@trillionbusinesscommunity.com';
const ADMIN_PASSWORD_HASH =
  '76eda3f4147637ed68a823cee3fcea56:cd2f41227769096bbb6b1287f654b318d8603782356ac1943be44feeccf1621b';

function login(email, password) {
  const wantEmail = (process.env.ALADINO_SHARES_ADMIN_EMAIL || ADMIN_EMAIL).trim().toLowerCase();
  const [salt, hash] = (process.env.ALADINO_SHARES_ADMIN_HASH || ADMIN_PASSWORD_HASH).split(':');
  const got = crypto.scryptSync(String(password ?? ''), salt, 32);
  const want = Buffer.from(hash, 'hex');
  const pwOk = got.length === want.length && crypto.timingSafeEqual(got, want);
  const emailOk = safeEqual(String(email ?? '').trim().toLowerCase(), wantEmail);
  if (!pwOk || !emailOk) throw new ShareError(401, 'Wrong email or password.');
  return jwt.sign({ scope: SCOPE }, process.env.JWT_SECRET, { expiresIn: SESSION });
}

function requireShareAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p.scope === SCOPE) return next();
  } catch { /* fall through */ }
  res.status(401).json({ error: 'Not logged in.' });
}

async function adminData() {
  const keys = Object.keys(OFFERINGS);
  const [states, rows] = await Promise.all([
    Promise.all(keys.map(async (k) => shape(await settingsOf(prisma, k), await bookedOf(prisma, k)))),
    prisma.aladinoShareBooking.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    offerings: Object.fromEntries(keys.map((k, i) => [k, { ...states[i], label: OFFERINGS[k].label }])),
    bookings: rows.map((b) => ({ ...b, offering: offeringOf(b.offering), status: b.status.toLowerCase() })),
  };
}

async function updateSettings(body) {
  const offering = offeringOf(body.offering);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
    const data = {};
    if (typeof body.visible === 'boolean') data.visible = body.visible;
    if (typeof body.allowLookup === 'boolean') data.allowLookup = body.allowLookup;
    if (body.totalShares !== undefined) {
      const t = Number(body.totalShares);
      const booked = await bookedOf(tx, offering);
      if (!Number.isInteger(t) || t < 0) throw new ShareError(400, 'Total shares must be a whole number ≥ 0.');
      if (t < booked) {
        throw new ShareError(400, `Total can't be lower than already booked shares (${booked}). Undo bookings first.`);
      }
      data.totalShares = t;
    }
    await settingsOf(tx, offering);
    const s = await tx.aladinoShareSettings.update({ where: { id: offering }, data });
    return shape(s, await bookedOf(tx, offering));
  });
}

async function bookingAction(id, action) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
    const b = await tx.aladinoShareBooking.findUnique({ where: { id } });
    if (!b) throw new ShareError(404, 'Booking not found.');
    const offering = offeringOf(b.offering);
    const s = await settingsOf(tx, offering);
    const booked = await bookedOf(tx, offering);
    if (action === 'cancel') {
      await tx.aladinoShareBooking.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    } else if (action === 'restore') {
      if (b.status !== 'CANCELLED') throw new ShareError(400, 'Booking is already active.');
      const left = Math.max(0, s.totalShares - booked);
      if (b.shares > left) throw new ShareError(409, `Not enough shares available to restore (${left} left).`);
      await tx.aladinoShareBooking.update({ where: { id }, data: { status: 'ACTIVE', cancelledAt: null } });
    } else {
      if (b.status === 'ACTIVE') throw new ShareError(400, 'Undo the booking before deleting it.');
      await tx.aladinoShareBooking.delete({ where: { id } });
    }
    return shape(s, await bookedOf(tx, offering));
  });
}

async function exportCsv() {
  const keys = Object.keys(OFFERINGS);
  const [all, rows] = await Promise.all([
    Promise.all(keys.map((k) => settingsOf(prisma, k))),
    prisma.aladinoShareBooking.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  const settings = Object.fromEntries(all.map((x) => [x.id, x]));
  const esc = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;   // block spreadsheet formula injection
    return `"${t.replace(/"/g, '""')}"`;
  };
  const out = [['Date', 'Source', 'Name', 'Email', 'Shares', 'Amount EUR', 'Stake %', 'Status']];
  for (const b of rows) {
    const o = offeringOf(b.offering);
    const s = settings[o];
    out.push([b.createdAt.toISOString(), OFFERINGS[o].label, b.name, b.email, b.shares, b.shares * s.pricePerShare,
      ((b.shares * s.pricePerShare) / s.valuation * 100).toFixed(4), b.status.toLowerCase()]);
  }
  return '﻿' + out.map((r) => r.map(esc).join(',')).join('\n');
}

module.exports = {
  ShareError, offeringOf, publicState, book, myBookings,
  login, requireShareAdmin, adminData, updateSettings, bookingAction, exportCsv,
};
