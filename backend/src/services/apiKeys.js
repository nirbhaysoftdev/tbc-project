// src/services/apiKeys.js
//
// Machine access to the read-only API: issuing keys, authenticating them and
// taking them away again.
//
// THE KEY IS NEVER STORED. `crypto.randomBytes(32)` is 256 bits of entropy,
// and what goes in the database is its SHA-256 digest. The plaintext is
// returned exactly once, by the request that created or rotated it, and there
// is deliberately no endpoint that can read one back - that is the only thing
// that makes hashing it worth doing. A dump of `api_keys` cannot be used to
// call the API.
//
// WHY SHA-256 AND NOT BCRYPT. Bcrypt is slow on purpose, to make guessing a
// human-chosen password expensive. A key here is 256 random bits: there is
// nothing to guess, and a 100ms hash would be paid on every single request. A
// plain digest is both safe for this input and one indexed lookup.
//
// WHY A TABLE AND NOT AN ENVIRONMENT VARIABLE. A shared secret in `.env`
// cannot be attributed to a caller, cannot be revoked without a restart, and
// cannot be rotated without a window in which one of the two values is wrong.
// A row per consumer makes rotation additive: issue the new key, let both work,
// revoke the old one when the consumer has moved.
const crypto = require('crypto');
const prisma = require('../utils/prismaClient');

/**
 * The scopes a key can hold. Deny by default: anything not listed on the key
 * is refused, and a scope that is not in here cannot be granted at all.
 */
const SCOPES = {
  'events:read': 'Read the event feed (GET /api/admin/events)',
  'events:counts': 'Read the counts only (GET /api/admin/events/counts)',
  // The one that matters. Without it a key sees the same events with the
  // identifying detail removed - see redactEvent() in services/eventFeed.js.
  // A marketing site that wants "3 new signups today" must not be able to pull
  // passports and IBANs if its key leaks.
  'events:sensitive': 'Include identity documents, bank details, addresses, phone numbers and enquiry message text',
};

const SCOPE_NAMES = Object.keys(SCOPES);

/** Live keys are the default; this is what the panel shows as "Live". */
const PREFIX = 'tbc_live_';

/** How much of the key is kept for display. Enough to tell two keys apart. */
const PREFIX_LENGTH = 16;

/** Keys expire in a year unless the caller explicitly asks for no expiry. */
const DEFAULT_TTL_DAYS = 365;

/** `lastUsedAt` is written at most this often, so a busy key is not a write per request. */
const LAST_USED_THROTTLE_MS = 60 * 1000;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Mint one key.
 *
 * 32 random bytes in base64url: 43 characters, URL- and header-safe, no
 * padding and nothing a shell will try to interpret. The prefix is there so a
 * leaked string is recognisable as a TBC key in a log or a repository scan.
 */
function generateKey() {
  const key = `${PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  return { key, keyHash: sha256(key), keyPrefix: key.slice(0, PREFIX_LENGTH) };
}

/** Validate a requested scope list. Throws with `invalid` for the caller to report. */
function parseScopes(raw) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw ?? '').split(/[,\s]+/);

  const scopes = [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];
  const invalid = scopes.filter((s) => !SCOPE_NAMES.includes(s));
  if (invalid.length) {
    throw Object.assign(new Error('Unknown scope'), { invalid });
  }
  if (!scopes.length) {
    throw Object.assign(new Error('At least one scope is required'), { invalid: [] });
  }
  return scopes;
}

/**
 * What a key looks like to the panel. Never includes the key, and cannot: the
 * row does not hold it.
 */
const publicShape = (row) => ({
  id:        row.id,
  name:      row.name,
  keyPrefix: row.keyPrefix,
  scopes:    row.scopes,
  status:    keyStatus(row),
  createdAt: row.createdAt,
  createdBy: row.createdBy ? { id: row.createdBy.id, name: row.createdBy.name } : null,
  lastUsedAt: row.lastUsedAt,
  lastUsedIp: row.lastUsedIp,
  expiresAt:  row.expiresAt,
  revokedAt:  row.revokedAt,
  revokedBy:  row.revokedBy ? { id: row.revokedBy.id, name: row.revokedBy.name } : null,
  rotatedFromId: row.rotatedFromId,
});

/** ACTIVE | REVOKED | EXPIRED - one word for the panel to colour. */
function keyStatus(row) {
  if (row.revokedAt) return 'REVOKED';
  if (row.expiresAt && row.expiresAt <= new Date()) return 'EXPIRED';
  return 'ACTIVE';
}

const WITH_PEOPLE = {
  createdBy: { select: { id: true, name: true } },
  revokedBy: { select: { id: true, name: true } },
};

// ── Issuing ───────────────────────────────────

/**
 * Create a key.
 *
 * @returns {Promise<{ key: string, apiKey: object }>} `key` is the plaintext,
 *          available here and never again.
 */
async function createApiKey({ name, scopes, expiresInDays, createdById, rotatedFromId }) {
  const cleanName = String(name ?? '').trim().slice(0, 120);
  if (!cleanName) throw Object.assign(new Error('A name is required'), { field: 'name' });

  const parsed = parseScopes(scopes);
  const { key, keyHash, keyPrefix } = generateKey();

  // `null` for "never expires" has to be asked for explicitly. An expiry you
  // did not choose is an outage; an expiry nobody ever set is a key still
  // working three years after the integration was switched off.
  const days = expiresInDays === null ? null
    : Number.isFinite(Number(expiresInDays)) ? Number(expiresInDays)
    : DEFAULT_TTL_DAYS;

  const row = await prisma.apiKey.create({
    data: {
      name: cleanName,
      keyHash,
      keyPrefix,
      scopes: parsed,
      createdById: createdById ?? null,
      rotatedFromId: rotatedFromId ?? null,
      expiresAt: days === null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    },
    include: WITH_PEOPLE,
  });

  return { key, apiKey: publicShape(row) };
}

/**
 * Replace a key with a new one carrying the same name and scopes.
 *
 * The old key is NOT revoked here. Rotation has to be additive or it is an
 * outage: the consumer gets the new key, both work while they deploy it, and
 * the old one is revoked once `lastUsedAt` stops moving.
 */
async function rotateApiKey(id, { createdById }) {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) return null;

  const created = await createApiKey({
    name: existing.name,
    scopes: existing.scopes,
    expiresInDays: existing.expiresAt
      ? Math.max(1, Math.round((existing.expiresAt - existing.createdAt) / (24 * 60 * 60 * 1000)))
      : null,
    createdById,
    rotatedFromId: existing.id,
  });

  return { ...created, replaced: publicShape(existing) };
}

// ── Taking it away ────────────────────────────

async function revokeApiKey(id, { revokedById }) {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) return null;
  // Revoking twice is not an error, and must not move the timestamp: the first
  // one is when the key actually stopped working.
  if (existing.revokedAt) {
    return publicShape(await prisma.apiKey.findUnique({ where: { id }, include: WITH_PEOPLE }));
  }

  const row = await prisma.apiKey.update({
    where: { id },
    data:  { revokedAt: new Date(), revokedById: revokedById ?? null },
    include: WITH_PEOPLE,
  });
  return publicShape(row);
}

/** Rename, re-scope or change the expiry of a key. Never its secret. */
async function updateApiKey(id, { name, scopes, expiresInDays, expiresAt }) {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) return null;

  const data = {};
  if (name !== undefined) {
    const cleanName = String(name).trim().slice(0, 120);
    if (!cleanName) throw Object.assign(new Error('A name is required'), { field: 'name' });
    data.name = cleanName;
  }
  if (scopes !== undefined) data.scopes = parseScopes(scopes);
  if (expiresAt !== undefined || expiresInDays !== undefined) {
    if (expiresAt === null || expiresInDays === null) {
      data.expiresAt = null;
    } else if (expiresInDays !== undefined) {
      const days = Number(expiresInDays);
      if (!Number.isFinite(days) || days <= 0) {
        throw Object.assign(new Error('expiresInDays must be a positive number, or null for no expiry'), { field: 'expiresInDays' });
      }
      data.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    } else {
      const when = new Date(expiresAt);
      if (Number.isNaN(when.getTime())) {
        throw Object.assign(new Error('expiresAt must be a date, or null for no expiry'), { field: 'expiresAt' });
      }
      data.expiresAt = when;
    }
  }

  if (!Object.keys(data).length) return publicShape(await prisma.apiKey.findUnique({ where: { id }, include: WITH_PEOPLE }));

  const row = await prisma.apiKey.update({ where: { id }, data, include: WITH_PEOPLE });
  return publicShape(row);
}

async function listApiKeys({ includeRevoked = true } = {}) {
  const rows = await prisma.apiKey.findMany({
    where: includeRevoked ? {} : { revokedAt: null },
    include: WITH_PEOPLE,
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(publicShape);
}

// ── Authenticating ────────────────────────────

/**
 * Resolve a presented key.
 *
 * Looked up by digest, so a wrong key is a miss on a unique index rather than
 * a comparison against every row - there is no timing signal to extract and
 * nothing to compare in constant time.
 *
 * @returns {Promise<{ ok: true, key: object } | { ok: false, reason: string }>}
 */
async function verify(presented) {
  if (typeof presented !== 'string' || !presented.trim()) {
    return { ok: false, reason: 'missing' };
  }
  const row = await prisma.apiKey.findUnique({ where: { keyHash: sha256(presented.trim()) } });
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.revokedAt) return { ok: false, reason: 'revoked' };
  if (row.expiresAt && row.expiresAt <= new Date()) return { ok: false, reason: 'expired' };
  return { ok: true, key: row };
}

const hasScope = (key, scope) => Array.isArray(key?.scopes) && key.scopes.includes(scope);

/**
 * Record that a key was used. Fire and forget, and throttled: a key polling
 * every ten seconds would otherwise be an UPDATE every ten seconds for a
 * column nobody reads in real time.
 */
function touch(key, ip) {
  if (key.lastUsedAt && Date.now() - key.lastUsedAt.getTime() < LAST_USED_THROTTLE_MS) return;
  prisma.apiKey.update({
    where: { id: key.id },
    data:  { lastUsedAt: new Date(), lastUsedIp: ip ? String(ip).slice(0, 64) : null },
  }).catch((err) => console.error('apiKey touch failed:', err.message));
}

module.exports = {
  SCOPES, SCOPE_NAMES, PREFIX, DEFAULT_TTL_DAYS,
  generateKey, parseScopes, keyStatus,
  createApiKey, rotateApiKey, revokeApiKey, updateApiKey, listApiKeys,
  verify, hasScope, touch,
};
