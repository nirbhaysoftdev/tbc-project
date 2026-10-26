// src/services/eventFeed.js
//
// One merged, time-ordered feed of the three things the portal has to tell an
// admin about as they happen:
//
//   SIGNUP      a new member applied, with their details and current status
//   WITHDRAWAL  a member asked for money out, with the member and the amount
//   ENQUIRY     a member enquired about a project or a company
//
// WHY THIS IS NOT THE ACTIVITY LOG. `services/activityLog.js` is an
// append-only record of what happened, frozen at the moment it happened. This
// feed answers a different question: "what is waiting for me, and where does
// it stand NOW?". A signup logged as PENDING in March is ACTIVE today, and the
// log row still says PENDING forever - correctly, because that is what it is
// for. So every event here is read from its SOURCE table (users,
// withdraw_requests, enquiries) and carries the live status. The log keeps the
// history; this keeps the state.
//
// WHY EVERY FIELD IS ADMIN-ONLY. A signup event carries the applicant's phone,
// addresses and identity-document paths; a withdrawal event carries bank
// details and an amount; an enquiry event carries another member's message.
// None of it may be serialised to a member - see services/memberVisibility.js
// for the projection that member-facing payloads use instead. The routes that
// expose this feed are gated with `requireAdmin` or an API key, and nothing in
// here is safe to reuse behind a member-facing endpoint.
//
// A machine caller gets LESS than an admin: unless its key carries the
// `events:sensitive` scope the payload goes through `redactEvent` at the
// bottom of this file, which is an allowlist rather than a denylist on
// purpose.
//
// HOW THE MERGE WORKS. Three tables cannot be paginated by one SQL ORDER BY
// without a UNION, so each kind is read `skip + take` deep, the three lists are
// merge-sorted on their timestamp and the page is sliced out of the result.
// That is at most three small indexed queries per request; the cost grows with
// how deep you page, which is why `MAX_SCAN` puts a ceiling on it and the
// answer to "I need older events" is `until=`, not page 400.
const prisma = require('../utils/prismaClient');
const { LIVE_USER } = require('../utils/roles');

/** The kinds, in the order they are listed back to the caller. */
const KINDS = ['SIGNUP', 'WITHDRAWAL', 'ENQUIRY'];

/**
 * The statuses each kind can be in. A `status` filter is matched against the
 * kind being read, so `?kind=SIGNUP,WITHDRAWAL&status=ACTIVE` returns the
 * ACTIVE signups and no withdrawals - rather than an error about a value that
 * is perfectly valid for the other kind.
 */
const STATUSES = {
  SIGNUP:     ['PENDING', 'ACTIVE', 'REJECTED', 'FROZEN'],
  WITHDRAWAL: ['PENDING', 'APPROVED', 'REJECTED'],
  ENQUIRY:    ['PENDING', 'SENT', 'FAILED'],
};

/**
 * The status that means "an admin still has to do something about this".
 * A failed enquiry is in the list for the same reason a pending withdrawal is:
 * it is the one that needs a human. A PENDING enquiry is mid-flight and
 * resolves itself within the request that created it.
 */
const NEEDS_ATTENTION = {
  SIGNUP:     'PENDING',
  WITHDRAWAL: 'PENDING',
  ENQUIRY:    'FAILED',
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// The deepest any single kind is read. Reached only by paging a long way in;
// `since`/`until` is how a caller walks a large range, and the controller says
// so in the error rather than quietly truncating the feed.
const MAX_SCAN = 1000;

/** A date that is actually a date, or undefined. Never an Invalid Date. */
const asDate = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * `createdAt` bounds shared by all three readers.
 *
 * `since` is EXCLUSIVE: a poller passes back the `latestAt` it was given, and
 * an inclusive bound would hand it the same newest event on every tick.
 */
const createdAtFilter = ({ since, until }) => {
  const range = {};
  if (since) range.gt = since;
  if (until) range.lte = until;
  return Object.keys(range).length ? { createdAt: range } : {};
};

/** Case-insensitive `contains` across the given fields, as a Prisma OR. */
const textMatch = (q, fields) => (
  q ? { OR: fields.map((f) => setPath(f, { contains: q, mode: 'insensitive' })) } : {}
);

/** `setPath('member.name', v)` -> `{ member: { name: v } }`. */
function setPath(path, value) {
  return path.split('.').reverse().reduce((acc, key) => ({ [key]: acc }), value);
}

// ── SIGNUP ────────────────────────────────────
//
// Source: the member's own row, so the status is today's status.
//
// Admin-created members appear here too: an admin looking at "who is new"
// wants both, and `detail.source` says which it was. That is derived from the
// `SELF_REGISTER` admin-log row the signup endpoint writes, because the user
// row alone cannot tell a self-registration from an account an admin keyed in.
const signupWhere = ({ status, memberId, q, since, until }) => ({
  ...LIVE_USER,
  role: 'MEMBER',
  ...createdAtFilter({ since, until }),
  ...(status ? { status } : {}),
  ...(memberId ? { id: memberId } : {}),
  ...textMatch(q, ['name', 'email']),
});

const SIGNUP_SELECT = {
  id: true, name: true, email: true, profilePhoto: true,
  status: true, kycStatus: true, walletEnabled: true, emailVerified: true,
  accountType: true, googleId: true, locale: true, createdAt: true,
  profile: {
    select: {
      company: true, industry: true, jobTitle: true, experienceYears: true,
      country: true, city: true,
      phone: true, phoneCountry: true, phoneDialCode: true,
      linkedIn: true, website: true, bio: true, interests: true,
      vatNumber: true, billingAddress: true, businessAddress: true,
      // Paths, not bytes. They are only openable through /uploads, which
      // authorises every request against the database (services/fileAccess.js
      // classifies these four columns as DOC: the owner or an admin). Listing
      // them here does not widen who can read the file.
      passportUrl: true, residentIdUrl: true, tradeLicenseUrl: true, cvUrl: true,
    },
  },
};

function projectSignup(user, { selfRegistered }) {
  const p = user.profile || {};
  return {
    id:    `signup:${user.id}`,
    kind:  'SIGNUP',
    at:    user.createdAt,
    status: user.status,
    title: `New member application: ${user.name}`,
    needsAttention: user.status === NEEDS_ATTENTION.SIGNUP,
    member: {
      id: user.id, name: user.name, email: user.email,
      photo: user.profilePhoto, accountType: user.accountType,
    },
    // A signup moves no money.
    amount: null,
    detail: {
      status:        user.status,
      kycStatus:     user.kycStatus,
      walletEnabled: user.walletEnabled,
      emailVerified: user.emailVerified,
      accountType:   user.accountType,
      source:        selfRegistered ? 'SELF' : 'ADMIN',
      signupMethod:  user.googleId ? 'google' : 'email',
      locale:        user.locale,
      company:       p.company ?? null,
      industry:      p.industry ?? null,
      jobTitle:      p.jobTitle ?? null,
      experienceYears: p.experienceYears ?? null,
      country:       p.country ?? null,
      city:          p.city ?? null,
      phone:         p.phone ?? null,
      phoneCountry:  p.phoneCountry ?? null,
      phoneDialCode: p.phoneDialCode ?? null,
      linkedIn:      p.linkedIn ?? null,
      website:       p.website ?? null,
      bio:           p.bio ?? null,
      interests:     p.interests ?? [],
      vatNumber:     p.vatNumber ?? null,
      billingAddress:  p.billingAddress ?? null,
      businessAddress: p.businessAddress ?? null,
      documents: {
        passportUrl:     p.passportUrl ?? null,
        residentIdUrl:   p.residentIdUrl ?? null,
        tradeLicenseUrl: p.tradeLicenseUrl ?? null,
        cvUrl:           p.cvUrl ?? null,
      },
    },
  };
}

async function readSignups(filters, { skip, take }) {
  const rows = await prisma.user.findMany({
    where:   signupWhere(filters),
    select:  SIGNUP_SELECT,
    orderBy: { createdAt: 'desc' },
    take:    skip + take,
  });
  if (!rows.length) return [];

  // One extra query for the whole page rather than one per row.
  const selfRegistered = new Set(
    (await prisma.adminLog.findMany({
      where:  { action: 'SELF_REGISTER', adminId: { in: rows.map((r) => r.id) } },
      select: { adminId: true },
    })).map((l) => l.adminId),
  );

  return rows.map((row) => projectSignup(row, {
    // Google signups predate the SELF_REGISTER row, so a Google account with
    // no admin-log row is still a self-registration.
    selfRegistered: selfRegistered.has(row.id) || Boolean(row.googleId),
  }));
}

// ── WITHDRAWAL ────────────────────────────────
//
// Source: withdraw_requests, so `status` tracks the admin decision.
const withdrawalWhere = ({ status, memberId, q, since, until }) => ({
  ...createdAtFilter({ since, until }),
  ...(status ? { status } : {}),
  ...(memberId ? { userId: memberId } : {}),
  // A soft-deleted member's requests drop out of the feed with them.
  user: LIVE_USER,
  ...textMatch(q, ['user.name', 'user.email', 'reason', 'bankName', 'companyName']),
});

function projectWithdrawal(r) {
  return {
    id:    `withdrawal:${r.id}`,
    kind:  'WITHDRAWAL',
    at:    r.createdAt,
    status: r.status,
    title: `Withdrawal requested by ${r.user.name}`,
    needsAttention: r.status === NEEDS_ATTENTION.WITHDRAWAL,
    member: {
      id: r.user.id, name: r.user.name, email: r.user.email,
      photo: r.user.profilePhoto, accountType: r.user.accountType,
    },
    amount: r.amount,
    detail: {
      requestId:     r.id,
      status:        r.status,
      amount:        r.amount,
      reason:        r.reason,
      accountHolder: `${r.firstName} ${r.lastName}`.trim(),
      companyName:   r.companyName,
      bankName:      r.bankName,
      iban:          r.iban,
      swiftNumber:   r.swiftNumber,
      address:       r.address,
      decidedAt:     r.status === 'PENDING' ? null : r.updatedAt,
    },
  };
}

async function readWithdrawals(filters, { skip, take }) {
  const rows = await prisma.withdrawRequest.findMany({
    where:   withdrawalWhere(filters),
    include: {
      user: { select: { id: true, name: true, email: true, profilePhoto: true, accountType: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    skip + take,
  });
  return rows.map(projectWithdrawal);
}

// ── ENQUIRY ───────────────────────────────────
//
// Source: enquiries, so `status` is the live delivery state (a FAILED enquiry
// that is retried stops being FAILED here).
const enquiryWhere = ({ status, memberId, q, since, until }) => ({
  ...createdAtFilter({ since, until }),
  ...(status ? { status } : {}),
  ...(memberId ? { memberId } : {}),
  member: LIVE_USER,
  ...textMatch(q, ['member.name', 'member.email', 'subjectName', 'message']),
});

function projectEnquiry(e) {
  // Which page the member was on. `subjectName` is the name as it was at send
  // time and survives a rename or a deletion, so it is what the event shows;
  // the live relation is there for a link, when the row still exists.
  const target = e.companyId ? 'COMPANY' : 'PROJECT';
  const subject = target === 'COMPANY'
    ? (e.company && {
        id: e.company.id, name: e.company.name,
        status: e.company.status, valuation: e.company.valuation,
      })
    : (e.project && {
        id: e.project.id, name: e.project.title, status: e.project.status,
        targetAmount: e.project.targetAmount, raisedAmount: e.project.raisedAmount,
      });

  return {
    id:    `enquiry:${e.id}`,
    kind:  'ENQUIRY',
    at:    e.createdAt,
    status: e.status,
    title: `Enquiry about ${e.subjectName}`,
    needsAttention: e.status === NEEDS_ATTENTION.ENQUIRY,
    member: {
      id: e.member.id, name: e.member.name, email: e.member.email,
      photo: e.member.profilePhoto, accountType: e.member.accountType,
    },
    // An enquiry moves no money, so there is no amount to report. The figures
    // belonging to what they asked about are under `detail.subject` - putting
    // a project's target amount in `amount` would read as a sum this member
    // requested, which is not what happened.
    amount: null,
    detail: {
      enquiryId:   e.id,
      status:      e.status,
      target,                       // 'PROJECT' | 'COMPANY'
      subjectName: e.subjectName,
      subject:     subject || null, // null once the project or company is gone
      message:     e.message,
      sentAt:      e.sentAt,
      error:       e.error,
      // How many mailboxes it went to. The addresses themselves stay out of
      // this feed - they are internal routing, and GET /api/enquiries is where
      // an admin chasing a delivery can see them.
      recipientCount: e.recipientEmail
        ? e.recipientEmail.split(',').filter((s) => s.trim()).length
        : 0,
    },
  };
}

async function readEnquiries(filters, { skip, take }) {
  const rows = await prisma.enquiry.findMany({
    where:   enquiryWhere(filters),
    include: {
      member:  { select: { id: true, name: true, email: true, profilePhoto: true, accountType: true } },
      project: { select: { id: true, title: true, status: true, targetAmount: true, raisedAmount: true } },
      company: { select: { id: true, name: true, status: true, valuation: true } },
    },
    orderBy: { createdAt: 'desc' },
    take:    skip + take,
  });
  return rows.map(projectEnquiry);
}

// ── The kinds, as one table ───────────────────
const READERS = {
  SIGNUP:     { read: readSignups,     where: signupWhere,     count: (w) => prisma.user.count({ where: w }) },
  WITHDRAWAL: { read: readWithdrawals, where: withdrawalWhere, count: (w) => prisma.withdrawRequest.count({ where: w }) },
  ENQUIRY:    { read: readEnquiries,   where: enquiryWhere,    count: (w) => prisma.enquiry.count({ where: w }) },
};

/**
 * Normalise what arrived on the query string. Invalid values are rejected
 * here, once, so no reader has to guess what a caller meant.
 *
 * @returns {{ ok: true, filters: object, page: number, limit: number }
 *          | { ok: false, error: string }}
 */
function parseQuery(query = {}) {
  const asList = (v) => String(v).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

  let kinds = KINDS;
  if (query.kind) {
    kinds = asList(query.kind);
    const unknown = kinds.filter((k) => !KINDS.includes(k));
    if (unknown.length) {
      return { ok: false, error: `Unknown event kind: ${unknown.join(', ')}. Valid kinds are ${KINDS.join(', ')}.` };
    }
  }

  let status;
  if (query.status) {
    status = String(query.status).trim().toUpperCase();
    const valid = kinds.some((k) => STATUSES[k].includes(status));
    if (!valid) {
      return {
        ok: false,
        error: `"${status}" is not a status of ${kinds.join(', ')}.`,
      };
    }
  }

  if (query.since !== undefined && query.since !== '' && !asDate(query.since)) {
    return { ok: false, error: '`since` must be a date, e.g. 2026-10-26T09:00:00.000Z' };
  }
  if (query.until !== undefined && query.until !== '' && !asDate(query.until)) {
    return { ok: false, error: '`until` must be a date, e.g. 2026-10-26T09:00:00.000Z' };
  }

  const limit = Math.min(Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page  = Math.max(parseInt(query.page, 10) || 1, 1);

  if ((page - 1) * limit + limit > MAX_SCAN) {
    return {
      ok: false,
      error: `Cannot page beyond ${MAX_SCAN} events. Narrow the range with ?until= (or poll forward with ?since=) instead.`,
    };
  }

  const q = typeof query.q === 'string' && query.q.trim() ? query.q.trim().slice(0, 200) : undefined;

  return {
    ok: true,
    page,
    limit,
    filters: {
      kinds,
      status,
      q,
      memberId: typeof query.memberId === 'string' && query.memberId ? query.memberId : undefined,
      since: asDate(query.since),
      until: asDate(query.until),
    },
  };
}

/** Newest first; ties broken on id so the order is total and stable. */
const byNewest = (a, b) => (
  b.at.getTime() - a.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
);

/**
 * The feed.
 *
 * @param {object} filters   from parseQuery
 * @param {object} paging    { page, limit }
 * @returns {Promise<{events: object[], counts: object, pagination: object, latestAt: Date|null}>}
 */
async function listEvents(filters, { page = 1, limit = DEFAULT_LIMIT } = {}) {
  const skip = (page - 1) * limit;
  const take = limit;

  // A kind whose statuses do not include the requested one contributes
  // nothing, and must not be queried with a status its column cannot hold.
  const active = filters.kinds.filter((k) => !filters.status || STATUSES[k].includes(filters.status));

  const perKind = await Promise.all(active.map(async (kind) => {
    const reader = READERS[kind];
    const [rows, total] = await Promise.all([
      reader.read(filters, { skip, take }),
      reader.count(reader.where(filters)),
    ]);
    return { kind, rows, total };
  }));

  const merged = perKind.flatMap((k) => k.rows).sort(byNewest);

  const counts = Object.fromEntries(KINDS.map((kind) => [
    kind, perKind.find((k) => k.kind === kind)?.total ?? 0,
  ]));
  counts.total = KINDS.reduce((sum, kind) => sum + counts[kind], 0);

  return {
    events: merged.slice(skip, skip + take),
    counts,
    // The newest timestamp in the filtered set, for a poller to send back as
    // `since`. Taken from the merged list before it is sliced, so it is the
    // newest event there IS and not merely the newest on this page.
    latestAt: merged[0]?.at ?? null,
    pagination: { page, limit, total: counts.total, pages: Math.ceil(counts.total / limit) },
  };
}

/**
 * Counts only - no rows read, no payloads built. This is what a notification
 * bell polls: three indexed COUNT(*)s and nothing else.
 *
 * `counts` honours the filters; `needsAttention` deliberately ignores `status`
 * and `since`, because "3 applications are waiting" is a fact about the whole
 * table, not about what has happened since the last poll.
 */
async function countEvents(filters) {
  const entries = await Promise.all(KINDS.map(async (kind) => {
    const reader = READERS[kind];
    const inScope = filters.kinds.includes(kind)
      && (!filters.status || STATUSES[kind].includes(filters.status));

    const [total, attention] = await Promise.all([
      inScope ? reader.count(reader.where(filters)) : 0,
      reader.count(reader.where({
        ...filters, status: NEEDS_ATTENTION[kind], since: undefined, until: undefined,
      })),
    ]);
    return [kind, { total, needsAttention: attention }];
  }));

  const counts = Object.fromEntries(entries.map(([kind, v]) => [kind, v.total]));
  counts.total = KINDS.reduce((sum, kind) => sum + counts[kind], 0);

  const needsAttention = Object.fromEntries(entries.map(([kind, v]) => [kind, v.needsAttention]));
  needsAttention.total = KINDS.reduce((sum, kind) => sum + needsAttention[kind], 0);

  return { counts, needsAttention };
}

// ── Redaction for machine callers ─────────────
//
// An API key without the `events:sensitive` scope gets the same events with
// everything identifying removed. This is an ALLOWLIST, deliberately: a denylist
// would leak the next field somebody adds to a projection above, which is
// exactly how `profile: true` leaked document URLs between accounts before
// services/memberVisibility.js existed.
//
// What survives is enough to drive a dashboard - how many, of what, at what
// time, for how much, and whether it still needs a human. What does not survive
// is any way to contact or identify the member, read their message, or reach
// their money: email, photo, phone, addresses, VAT number, identity-document
// paths, bank account details and enquiry message text.
const REDACTED_DETAIL = {
  SIGNUP: (d) => ({
    status:        d.status,
    kycStatus:     d.kycStatus,
    walletEnabled: d.walletEnabled,
    emailVerified: d.emailVerified,
    accountType:   d.accountType,
    source:        d.source,
    signupMethod:  d.signupMethod,
    // Coarse location and professional classification only.
    country:  d.country,
    industry: d.industry,
    jobTitle: d.jobTitle,
    // Whether a document was supplied, never where it lives.
    documents: {
      passport:     Boolean(d.documents?.passportUrl),
      residentId:   Boolean(d.documents?.residentIdUrl),
      tradeLicence: Boolean(d.documents?.tradeLicenseUrl),
      cv:           Boolean(d.documents?.cvUrl),
    },
  }),
  WITHDRAWAL: (d) => ({
    requestId: d.requestId,
    status:    d.status,
    amount:    d.amount,
    // The institution, not the account. `reason` is free text the member wrote
    // and can contain anything, so it goes with the account details.
    bankName:  d.bankName,
    decidedAt: d.decidedAt,
  }),
  ENQUIRY: (d) => ({
    enquiryId:   d.enquiryId,
    status:      d.status,
    target:      d.target,
    // What they asked about is not private - it is a page every member can
    // open. What they wrote about it is.
    subjectName: d.subjectName,
    subject:     d.subject,
    sentAt:      d.sentAt,
    recipientCount: d.recipientCount,
    messageLength:  typeof d.message === 'string' ? d.message.length : 0,
  }),
};

/** One event, with the identifying detail removed. */
function redactEvent(event) {
  return {
    id:     event.id,
    kind:   event.kind,
    at:     event.at,
    status: event.status,
    needsAttention: event.needsAttention,
    amount: event.amount,
    // No email, no photo. A name and an id, so a dashboard can still say who
    // and a follow-up call to an admin-session endpoint can still resolve them.
    member: { id: event.member.id, name: event.member.name, accountType: event.member.accountType },
    detail: REDACTED_DETAIL[event.kind](event.detail),
    redacted: true,
  };
}

module.exports = {
  KINDS, STATUSES, NEEDS_ATTENTION,
  DEFAULT_LIMIT, MAX_LIMIT, MAX_SCAN,
  parseQuery, listEvents, countEvents, redactEvent,
};
