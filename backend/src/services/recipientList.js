// src/services/recipientList.js
//
// One portal-wide list of email addresses, stored in `SystemConfig`, with an
// environment variable as the fallback.
//
// This started as the guts of enquirySettings.js and was lifted out when new
// signup notifications needed exactly the same thing: several addresses, every
// one of them receiving every message, editable in the panel, never able to
// end up empty. Two copies of the parsing rules would have drifted — one of
// them would have kept de-duplicating case-insensitively and the other would
// not, and nobody would notice until an address got two of everything.
//
// The stored value is a comma-separated string rather than JSON so it stays
// readable in the database and a single address still parses with no
// migration.
const prisma = require('../utils/prismaClient');

// A generous ceiling. The point is to stop a paste of a mailing list turning
// one notification into a hundred deliveries, not to ration the feature.
const MAX_RECIPIENTS = 10;

const isEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Parse a stored or submitted list into clean addresses.
 *
 * Accepts an array, or a string separated by commas, semicolons or whitespace —
 * which is what a paste out of a mail client or a spreadsheet looks like.
 * De-duplicated case-insensitively, because `Ops@x.com` and `ops@x.com` are
 * one mailbox and sending twice is just noise.
 *
 * Returns `{ emails, invalid }` so a caller can reject bad input rather than
 * silently dropping an address the admin believed they had configured.
 */
function parseRecipients(raw) {
  const candidates = Array.isArray(raw)
    ? raw
    : String(raw === null || raw === undefined ? '' : raw).split(/[,;\s]+/);

  const emails = [];
  const invalid = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    if (!isEmail(value)) { invalid.push(value); continue; }

    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(value);
  }

  return { emails: emails.slice(0, MAX_RECIPIENTS), invalid };
}

/**
 * Build the get/set pair for one setting.
 *
 * `key`        the SystemConfig key the list is stored under.
 * `fallback()` the address to use when nobody has configured one. Read lazily,
 *              on every call, because the environment is loaded after this
 *              module and a value captured at require time would be undefined.
 */
function recipientSetting({ key, fallback }) {
  /**
   * The addresses notifications go to, and where they came from.
   *
   * `source` matters to the admin screen: "this is the portal default" and "an
   * admin chose this" look identical otherwise, and the difference is what
   * tells you whether anyone has configured it.
   *
   * A stored value with nothing usable in it falls back rather than throwing. A
   * misconfiguration must not stop a notification being delivered.
   */
  async function get() {
    try {
      const row = await prisma.systemConfig.findUnique({ where: { key } });
      if (row) {
        const { emails } = parseRecipients(row.value);
        if (emails.length > 0) {
          return { emails, source: 'config', updatedAt: row.updatedAt };
        }
      }
    } catch (err) {
      // A database problem here must not break the notification itself, so the
      // default is used and the cause is logged.
      console.error(`recipientList(${key}) failed, using default:`, err.message);
    }
    const fell = parseRecipients(fallback()).emails;
    return { emails: fell, source: 'default', updatedAt: null };
  }

  /**
   * Store a new set of recipients.
   *
   * Returns the previous set as well as the new one, plus which addresses were
   * added and removed: a caller has to be able to tell a dropped address that
   * it will stop receiving mail, and it can only do that by knowing what
   * changed.
   */
  async function set(raw) {
    const { emails, invalid } = parseRecipients(raw);
    if (invalid.length > 0) {
      const error = new Error('invalid email');
      error.invalid = invalid;
      throw error;
    }
    if (emails.length === 0) {
      throw new Error('no recipients');
    }

    const previous = await get();

    await prisma.systemConfig.upsert({
      where:  { key },
      update: { value: emails.join(', ') },
      create: { key, value: emails.join(', ') },
    });

    // Compared case-insensitively, so re-saving a list with different
    // capitalisation is correctly seen as no change at all.
    const lower = (list) => new Set(list.map((e) => e.toLowerCase()));
    const wasConfigured = previous.source === 'config';
    const before = wasConfigured ? lower(previous.emails) : new Set();
    const after = lower(emails);

    return {
      previous: previous.emails,
      previousSource: previous.source,
      current: emails,
      // Only a previously CONFIGURED address can be "removed". The environment
      // default was never chosen by anyone, so announcing its removal would be
      // noise.
      added:   emails.filter((e) => !before.has(e.toLowerCase())),
      removed: wasConfigured ? previous.emails.filter((e) => !after.has(e.toLowerCase())) : [],
    };
  }

  return { CONFIG_KEY: key, get, set };
}

module.exports = { MAX_RECIPIENTS, isEmail, parseRecipients, recipientSetting };
