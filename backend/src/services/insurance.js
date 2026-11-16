// src/services/insurance.js
//
// The annual insurance return. An admin records the first one by giving a % and
// a date: that % of the member's capital is credited as profit for that date at
// once, and `renewalDate` becomes the same date next year. From then on an
// ACTIVE policy is credited automatically on `renewalDate`, every year.
//
// `renewalDate` is always the NEXT payout. It is moved forward a year inside
// the same transaction that writes the credit, and that move is a conditional
// update on the date it read - so two processes (or two ticks) racing for the
// same renewal cannot both pay it: the loser's update matches nothing.
//
// The credit is an ordinary profit record (type INSURANCE) plus the ledger
// transaction, so it counts in the member's profit, balance, withdrawable
// amount and every report exactly like any other profit.
const prisma = require('../utils/prismaClient');
const walletService = require('./walletService');
const { logActivity } = require('./activityLog');
const { LIVE_USER } = require('../utils/roles');

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MAX_CATCH_UP = 5;   // years credited in one pass if the server was down a long time

const badRequest = (message, status = 400) => Object.assign(new Error(message), { status });

/** 'YYYY-MM-DD' or a Date -> local midnight, so the date the admin picked is the date it pays. */
function parseDay(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Same date next year; 29 Feb falls back to 28 Feb rather than rolling into March. */
function plusOneYear(d) {
  const next = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
  return next.getMonth() !== d.getMonth() ? new Date(d.getFullYear() + 1, d.getMonth() + 1, 0) : next;
}

const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

function validate({ ratePercent, renewalDate }, { requireFuture }) {
  const out = {};
  if (ratePercent !== undefined) {
    const r = Number(ratePercent);
    if (!(r > 0 && r <= 100)) throw badRequest('Insurance percentage must be greater than 0 and at most 100');
    out.ratePercent = r;
  }
  if (renewalDate !== undefined) {
    const d = parseDay(renewalDate);
    if (!d) throw badRequest('A valid renewal date is required');
    if (requireFuture && d <= startOfToday()) throw badRequest('The renewal date must be in the future');
    out.renewalDate = d;
  }
  return out;
}

/** First anniversary of `d` that is still ahead of today: the next automatic credit. */
function nextAnniversary(d) {
  const today = startOfToday();
  let next = plusOneYear(d);
  while (next <= today) next = plusOneYear(next);
  return next;
}

/** The payload for a policy: what it is, plus what it would credit today. */
async function present(policy, breakdownFor) {
  if (!policy) return null;
  const b = breakdownFor ? breakdownFor.get(policy.userId) : await walletService.getWalletBreakdown(policy.userId);
  const capital = money(b?.investedCapital);
  return {
    id: policy.id,
    userId: policy.userId,
    ratePercent: policy.ratePercent,
    renewalDate: policy.renewalDate,
    status: policy.status,
    capital,
    // Estimate on today's capital; the real figure is taken on the renewal date.
    expectedAmount: money((capital * policy.ratePercent) / 100),
    lastCreditedAt: policy.lastCreditedAt,
    lastCreditedAmount: policy.lastCreditedAmount,
    createdAt: policy.createdAt,
  };
}

async function getForUser(userId) {
  return present(await prisma.insurancePolicy.findUnique({ where: { userId } }));
}

/**
 * Record an insurance credit by hand: `ratePercent` of the member's capital,
 * credited as profit for `date` (today or earlier) right now. The policy is
 * created, or updated to this %, and its renewal date becomes the first
 * anniversary of `date` still ahead - so the same credit repeats by itself from
 * next year. Calling it again is "add one more insurance": a new date, and a
 * new % if it changed.
 *
 * The amount uses the capital the member holds today; history is not replayed.
 */
async function addCredit({ userId, ratePercent, date, actor }) {
  const member = await prisma.user.findFirst({ where: { id: userId, role: 'MEMBER', ...LIVE_USER }, select: { id: true, name: true, email: true } });
  if (!member) throw badRequest('Member not found', 404);
  const { ratePercent: rate } = validate({ ratePercent }, {});
  if (rate === undefined) throw badRequest('Percentage is required');
  const when = parseDay(date);
  if (!when) throw badRequest('A valid insurance date is required');
  if (when > startOfToday()) throw badRequest('The insurance date cannot be in the future; the credit is made for that date now.');
  const next = nextAnniversary(when);

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const capital = money((await walletService.getWalletBreakdown(userId, tx)).investedCapital);
      if (capital <= 0) throw badRequest('This member has no capital, so there is nothing to calculate insurance on');

      const before = await tx.insurancePolicy.findUnique({ where: { userId } });
      const { record, amount } = await writeCredit(tx, { userId, rate, renewal: when, capital, createdBy: actor?.id });
      const policy = await tx.insurancePolicy.upsert({
        where: { userId },
        create: { userId, ratePercent: rate, renewalDate: next, status: 'ACTIVE', lastCreditedAt: when, lastCreditedAmount: amount, createdBy: actor?.id },
        update: { ratePercent: rate, renewalDate: next, status: 'ACTIVE', lastCreditedAt: when, lastCreditedAmount: amount },
      });
      await walletService.syncWallet(userId, tx);
      return { record, amount, capital, policy, before };
    });
  } catch (err) {
    if (err.code === 'P2002') throw badRequest(`An insurance credit for ${dayKey(when)} already exists for this member`, 409);
    throw err;
  }

  const { record, amount, capital, policy, before } = result;
  if (!before) {
    logActivity({
      type: 'INSURANCE_SET', title: `Insurance set to ${rate}% · renews ${dayKey(next)}`,
      description: `Annual insurance return for ${member.name}`,
      actorId: actor?.id, actorName: actor?.name, targetId: userId,
      metadata: { policyId: policy.id, ratePercent: rate, renewalDate: dayKey(next) },
    });
  } else if (before.ratePercent !== rate) {
    logActivity({
      type: 'INSURANCE_UPDATED', title: `Insurance updated · ${member.name}`,
      description: `% ${before.ratePercent} → ${rate}, renewal ${dayKey(before.renewalDate)} → ${dayKey(next)}`,
      actorId: actor?.id, actorName: actor?.name, targetId: userId,
      metadata: { policyId: policy.id, before: { ratePercent: before.ratePercent, renewalDate: dayKey(before.renewalDate) }, after: { ratePercent: rate, renewalDate: dayKey(next) } },
    });
  }
  await announceCredit({ member, record, amount, capital, rate, renewal: when, next, policyId: policy.id, actor });
  return present(policy);
}

/** Super admin: change the %, the renewal date, or switch the policy on/off. */
async function update({ userId, ratePercent, renewalDate, status, actor }) {
  const current = await prisma.insurancePolicy.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
  if (!current) throw badRequest('No insurance policy for this member', 404);

  const v = validate({ ratePercent, renewalDate }, { requireFuture: true });
  const data = { ...v };
  if (status !== undefined) {
    if (!['ACTIVE', 'DISABLED'].includes(status)) throw badRequest('Status must be ACTIVE or DISABLED');
    data.status = status;
  }
  // Re-enabling a policy whose date has passed would credit it at once for a
  // year nobody was insured, so it must be given a fresh date.
  const enabling = data.status === 'ACTIVE' && current.status !== 'ACTIVE';
  if (enabling && !data.renewalDate && current.renewalDate <= startOfToday()) {
    throw badRequest('Set a new renewal date to re-enable this policy');
  }
  if (Object.keys(data).length === 0) return present(current);

  const policy = await prisma.insurancePolicy.update({ where: { userId }, data });

  const changes = [];
  if (v.ratePercent !== undefined && v.ratePercent !== current.ratePercent) changes.push(`% ${current.ratePercent} → ${v.ratePercent}`);
  if (v.renewalDate && dayKey(v.renewalDate) !== dayKey(current.renewalDate)) changes.push(`renewal ${dayKey(current.renewalDate)} → ${dayKey(v.renewalDate)}`);
  const type = data.status && data.status !== current.status
    ? (data.status === 'DISABLED' ? 'INSURANCE_DISABLED' : 'INSURANCE_ENABLED')
    : 'INSURANCE_UPDATED';
  if (type !== 'INSURANCE_UPDATED') changes.push(data.status === 'DISABLED' ? 'disabled' : 'enabled');
  if (changes.length) {
    logActivity({
      type,
      title: `Insurance ${type === 'INSURANCE_DISABLED' ? 'disabled' : type === 'INSURANCE_ENABLED' ? 'enabled' : 'updated'} · ${current.user?.name || ''}`.trim(),
      description: changes.join(', '),
      actorId: actor?.id, actorName: actor?.name, targetId: userId,
      metadata: { policyId: policy.id, before: { ratePercent: current.ratePercent, renewalDate: dayKey(current.renewalDate), status: current.status }, after: { ratePercent: policy.ratePercent, renewalDate: dayKey(policy.renewalDate), status: policy.status } },
    });
  }
  return present(policy);
}

/** Every policy with the member and the figures a super admin needs in one table. */
async function listAll() {
  const policies = await prisma.insurancePolicy.findMany({
    where: { user: { ...LIVE_USER } },
    include: { user: { select: { id: true, name: true, email: true, status: true } } },
    orderBy: { renewalDate: 'asc' },
  });
  const breakdowns = await walletService.getWalletBreakdownsFor(policies.map((p) => p.userId));
  const rows = [];
  for (const p of policies) rows.push({ ...(await present(p, breakdowns)), member: p.user });

  // Active members with no policy, for the "add" picker.
  const enrolled = new Set(policies.map((p) => p.userId));
  const members = await prisma.user.findMany({
    where: { role: 'MEMBER', status: 'ACTIVE', ...LIVE_USER },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  const open = members.filter((m) => !enrolled.has(m.id));
  const capitals = await walletService.getWalletBreakdownsFor(open.map((m) => m.id));
  return { policies: rows, candidates: open.map((m) => ({ ...m, capital: money(capitals.get(m.id)?.investedCapital) })) };
}

/** The profit record + ledger transaction for one insurance credit. Call inside a transaction. */
async function writeCredit(tx, { userId, rate, renewal, capital, createdBy }) {
  const amount = money((capital * rate) / 100);
  const record = await tx.profitRecord.create({
    data: {
      userId, projectId: null, scopeKey: 'NO_PROJECT', type: 'INSURANCE',
      period: `INSURANCE-${dayKey(renewal)}`, capitalSnapshot: capital, rate,
      amount, generatedAt: renewal, createdBy: createdBy || 'system',
    },
  });
  await tx.transaction.create({
    data: {
      userId, type: 'CREDIT', category: 'PROFIT',
      description: `Insurance return (${dayKey(renewal)})`,
      amount, status: 'COMPLETED', profitRate: rate,
      profitRecordId: record.id, createdBy: createdBy || 'system', createdAt: renewal,
    },
  });
  return { record, amount };
}

/** Activity log entry, bell notification and statement email. Best-effort: never undoes the credit. */
async function announceCredit({ member, record, amount, capital, rate, renewal, next, policyId, actor }) {
  logActivity({
    type: 'INSURANCE_CREDITED',
    title: `Insurance return credited · ${amount.toLocaleString()}`,
    description: `${rate}% of ${capital.toLocaleString()} capital · date ${dayKey(renewal)} · next ${dayKey(next)}`,
    actorId: actor?.id, actorName: actor?.name || 'System', targetId: member.id, amount,
    metadata: { policyId, profitRecordId: record.id, ratePercent: rate, capital, date: dayKey(renewal), nextRenewal: dayKey(next), manual: Boolean(actor) },
  });
  try {
    require('./notifier').notify([member.id], {
      type: 'PROFIT_DISTRIBUTED', title: 'Insurance return credited',
      message: `€${amount.toLocaleString()} insurance return was added to your profit.`, link: '/dashboard',
    });
    if (member.email) {
      await require('./mailer').sendProfitStatementEmail({
        user: member, amount, projectTitle: null, rate, capitalBase: capital,
        period: dayKey(renewal), generatedAt: renewal, profitRecordId: record.id, isMonthly: false,
        label: 'Annual insurance return',
      });
    }
  } catch (err) {
    console.error('[insurance] notice failed:', err.message);
  }
}

/** Credit one due renewal. Returns the profit record, or null when it was skipped/claimed elsewhere. */
async function creditOne(policy) {
  const renewal = policy.renewalDate;
  const next = plusOneYear(renewal);

  const result = await prisma.$transaction(async (tx) => {
    // Claim: only the caller that still sees this renewal date gets to pay it.
    const claimed = await tx.insurancePolicy.updateMany({
      where: { id: policy.id, status: 'ACTIVE', renewalDate: renewal },
      data: { renewalDate: next },
    });
    if (claimed.count === 0) return null;

    const capital = money((await walletService.getWalletBreakdown(policy.userId, tx)).investedCapital);
    if (capital <= 0) return { skipped: true, capital };

    const { record, amount } = await writeCredit(tx, { userId: policy.userId, rate: policy.ratePercent, renewal, capital });
    await tx.insurancePolicy.update({ where: { id: policy.id }, data: { lastCreditedAt: renewal, lastCreditedAmount: amount } });
    await walletService.syncWallet(policy.userId, tx);
    return { record, capital, amount };
  });

  if (!result) return null;
  const member = await prisma.user.findUnique({ where: { id: policy.userId }, select: { id: true, name: true, email: true } });

  if (result.skipped) {
    logActivity({
      type: 'INSURANCE_SKIPPED', status: 'FAILED',
      title: `Insurance renewal skipped · ${member?.name || ''}`.trim(),
      description: `No capital on ${dayKey(renewal)}, so nothing was credited. Next renewal ${dayKey(next)}.`,
      actorName: 'System', targetId: policy.userId,
      metadata: { policyId: policy.id, renewalDate: dayKey(renewal) },
    });
    return null;
  }

  await announceCredit({ member, record: result.record, amount: result.amount, capital: result.capital, rate: policy.ratePercent, renewal, next, policyId: policy.id });
  return result.record;
}

/** Pay every ACTIVE policy whose renewal date has arrived (catching up missed years). */
async function creditDue(now = new Date()) {
  const due = await prisma.insurancePolicy.findMany({
    where: { status: 'ACTIVE', renewalDate: { lte: now } },
  });
  let credited = 0;
  for (const p of due) {
    let policy = p;
    for (let i = 0; i < MAX_CATCH_UP && policy && policy.renewalDate <= now; i += 1) {
      try {
        if (await creditOne(policy)) credited += 1;
      } catch (err) {
        console.error(`[insurance] ${policy.userId} ${dayKey(policy.renewalDate)}:`, err.message);
        break;
      }
      policy = await prisma.insurancePolicy.findUnique({ where: { id: p.id } });
      if (policy?.status !== 'ACTIVE') break;
    }
  }
  return { credited, checked: due.length };
}

module.exports = { getForUser, addCredit, update, nextAnniversary, listAll, creditDue, present, dayKey, plusOneYear };
