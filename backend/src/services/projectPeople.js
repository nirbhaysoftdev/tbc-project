// src/services/projectPeople.js
//
// Team members, investors, partners and clients on a project.
//
// These are stored as JSON arrays of `{ id, name, role? }` rather than join
// tables, for one reason: a partner or a client is frequently NOT a portal
// member. The admin form lets you pick a member by search or type a name, and
// both have to survive the save. A join table could only hold the first kind.
//
// Consequences that shape the code below:
//   - a member entry keeps `id`, which is what links the showcase back to a
//     real account, and `name` is snapshotted so a deleted account leaves the
//     project readable instead of blank;
//   - only `id` and `name` (and a free-text `role`) are ever stored, so this
//     can never become a second, unreviewed copy of a member's profile. See
//     services/memberVisibility.js — the names here are already visible to
//     members through the project card.
const prisma = require('../utils/prismaClient');

const MAX_PEOPLE = 60;      // a project list, not a mailing list
const MAX_NAME   = 120;
const MAX_ROLE   = 80;

const str = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Normalise one people field from a request body.
 *
 * Accepts, in order of preference:
 *   - an array of ids            (`investorIds: ["uuid", ...]`)
 *   - an array of objects        (`investors: [{ id, name, role }, ...]`)
 *   - a JSON string of either    (what a multipart form sends)
 *
 * Returns an array of `{ id, name, role? }`, or null when the field was not
 * supplied at all — null means "leave it alone" to the update path, which is
 * why an empty array (meaning "the admin removed everyone") is kept distinct.
 */
async function normalizePeople(raw) {
  if (raw === undefined) return null;
  if (raw === null || raw === '') return [];

  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      // A bare comma-separated list of names is a reasonable thing to receive
      // from a plain form, so take it rather than rejecting the whole save.
      value = value.split(',').map((name) => ({ name }));
    }
  }
  if (!Array.isArray(value)) return [];

  const entries = value
    .map((item) => {
      if (item === null || item === undefined) return null;
      if (typeof item === 'string') {
        // Either an id or a typed-in name; a uuid is treated as an id.
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.trim())
          ? { id: item.trim(), name: null }
          : { id: null, name: str(item, MAX_NAME) };
      }
      if (typeof item !== 'object') return null;
      return {
        id:   str(item.id, 64),
        name: str(item.name, MAX_NAME),
        role: str(item.role, MAX_ROLE),
      };
    })
    .filter((e) => e && (e.id || e.name))
    .slice(0, MAX_PEOPLE);

  // Resolve the names of entries given to us as bare ids, and refresh the
  // snapshot of the ones that came with a name, so a member who changed their
  // name is not frozen as the old one on every project they appear on.
  const ids = [...new Set(entries.map((e) => e.id).filter(Boolean))];
  const byId = new Map();
  if (ids.length > 0) {
    const users = await prisma.user.findMany({
      where:  { id: { in: ids } },
      select: { id: true, name: true },
    });
    users.forEach((u) => byId.set(u.id, u.name));
  }

  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const resolved = entry.id ? byId.get(entry.id) : null;
    // An id that resolves to nobody is kept only if it also carried a name;
    // otherwise there is nothing left to display and it is dropped.
    const name = resolved || entry.name;
    if (!name) continue;

    // `id` is only kept when it really is a member, so the frontend can trust
    // that an entry with an id links somewhere.
    const id = resolved ? entry.id : null;
    const key = id || `name:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const person = { name };
    if (id) person.id = id;
    if (entry.role) person.role = entry.role;
    out.push(person);
  }
  return out;
}

/**
 * Normalise every people field present on a body, into the shape
 * `prisma.project.update` takes. Fields absent from the body are absent from
 * the result.
 */
async function normalizePeopleFields(body) {
  const FIELDS = [
    ['teamMembers', 'teamMemberIds'],
    ['investors',   'investorIds'],
    ['partners',    'partnerIds'],
    ['clients',     'clientIds'],
  ];

  const data = {};
  for (const [field, idsField] of FIELDS) {
    // `*Ids` wins when both are sent: it is the explicit member-picker form.
    const raw = body[idsField] !== undefined ? body[idsField] : body[field];
    const people = await normalizePeople(raw);
    if (people !== null) data[field] = people;
  }
  return data;
}

module.exports = { normalizePeople, normalizePeopleFields, MAX_PEOPLE };
