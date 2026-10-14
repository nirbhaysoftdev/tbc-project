// src/services/enquirySettings.js
//
// The addresses that Connect Now / Enquire Now messages are delivered to, for
// every project and every company in the portal.
//
// It is portal-wide on purpose. It was briefly per-project and per-company,
// which meant the address had to be set again on every item an admin created
// and there was no way to answer "where do enquiries go?" without opening
// every record. One setting, changed in one place, is what this actually
// needs.
//
// SEVERAL addresses are supported, and every one of them receives every
// enquiry — they are recipients of the same message, not a rota. A team with a
// shared inbox and two partners who both want to see new interest is the case
// this exists for.
//
// Stored in `SystemConfig`, the key/value table that already exists for
// exactly this kind of thing. The value is a comma-separated list rather than
// JSON so it stays readable in the database and a single address — the shape
// this setting had before — still parses correctly with no migration.
//
// `DEFAULT_ENQUIRY_EMAIL` in the environment remains the fallback for a portal
// where nobody has set one yet, so enquiries can never be dropped for want of
// configuration.
const prisma = require('../utils/prismaClient');

const CONFIG_KEY = 'enquiryRecipientEmail';

// A generous ceiling. The point is to stop a paste of a mailing list turning
// one enquiry into a hundred deliveries, not to ration the feature.
const MAX_RECIPIENTS = 10;

const envDefault = () => process.env.DEFAULT_ENQUIRY_EMAIL || 'codehands12@gmail.com';

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
 * The addresses enquiries go to, and where they came from.
 *
 * `source` matters to the admin screen: "this is the portal default" and "an
 * admin chose this" look identical otherwise, and the difference is what tells
 * you whether anyone has configured it.
 *
 * A stored value with nothing usable in it falls back rather than throwing. A
 * misconfiguration must not stop a member's enquiry being delivered.
 */
async function getEnquiryRecipients() {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
    if (row) {
      const { emails } = parseRecipients(row.value);
      if (emails.length > 0) {
        return { emails, source: 'config', updatedAt: row.updatedAt };
      }
    }
  } catch (err) {
    // A database problem here must not break the enquiry itself, so the
    // default is used and the cause is logged.
    console.error('getEnquiryRecipients failed, using default:', err.message);
  }
  return { emails: [envDefault()], source: 'default', updatedAt: null };
}

/**
 * Store a new set of recipients.
 *
 * Returns the previous set as well as the new one, plus which addresses were
 * added and removed: the caller has to tell a dropped address that it will
 * stop receiving enquiries, and it can only do that by knowing what changed.
 */
async function setEnquiryRecipients(raw) {
  const { emails, invalid } = parseRecipients(raw);
  if (invalid.length > 0) {
    const error = new Error('invalid email');
    error.invalid = invalid;
    throw error;
  }
  if (emails.length === 0) {
    throw new Error('no recipients');
  }

  const previous = await getEnquiryRecipients();

  await prisma.systemConfig.upsert({
    where:  { key: CONFIG_KEY },
    update: { value: emails.join(', ') },
    create: { key: CONFIG_KEY, value: emails.join(', ') },
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

module.exports = {
  CONFIG_KEY,
  MAX_RECIPIENTS,
  getEnquiryRecipients,
  setEnquiryRecipients,
  parseRecipients,
  isEmail,
};
