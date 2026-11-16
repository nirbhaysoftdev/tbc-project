// src/services/memberReports.js
//
// The reports behind Super Admin → Reports and the monthly email sent on the 7th.
//
// Everything is derived per request from the same tables the wallet uses
// (walletService breakdowns, profit configs, the investment ledger), so a
// report cannot disagree with what a member sees. Nothing is stored.
//
// Every report is `{ key, title, columns, rows, totals? }`; `columns` carry a
// `type` (text | eur | pct | date | int) so the screen can format and the CSV
// can stay raw. These payloads hold balances and emails — super admin only.
const prisma = require('../utils/prismaClient');
const walletService = require('./walletService');
const engine = require('./investmentEngine');
const { LIVE_USER } = require('../utils/roles');

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Local calendar date: cycle dates are local midnights, and toISOString would
// shift them to the previous day on a server east of UTC.
const iso = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const CATALOGUE = [
  { key: 'members-financials', title: 'All members — investment, fix % & balance',
    description: 'Every active member with invested capital, profit, balance, their monthly fix % and what the next credit will be.' },
  { key: 'monthly-forecast', title: 'Upcoming monthly credits',
    description: 'Who will be credited on their next profit date, the % applied and the amount.' },
  { key: 'profit-credited', title: 'Profit credited', ranged: true,
    description: 'Every profit credited to members in a date range, monthly and one-time.' },
  { key: 'investments', title: 'Investments ledger',
    description: 'Every capital booking with returned and outstanding amounts.' },
  { key: 'insurance', title: 'Insurance policies',
    description: 'Every member\'s insurance %, capital, the amount it would credit, renewal date and status.' },
  { key: 'no-rate', title: 'Members without a monthly profit set',
    description: 'Members holding capital who have no monthly fix profit configured — nobody is being credited for them.' },
];

/** Next cycle date for a configured day: this month's if still ahead, else next month's (clamped to month end). */
function nextCycleDate(day, now = new Date()) {
  const at = (offset) => {
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0).getDate();
    return new Date(now.getFullYear(), now.getMonth() + offset, Math.min(day, last));
  };
  const thisMonth = at(0);
  return thisMonth > now ? thisMonth : at(1);
}

/** Active members + their breakdown + each active monthly config with the credit it will produce. */
async function loadMemberPositions(now = new Date()) {
  const members = await prisma.user.findMany({
    where: { role: 'MEMBER', status: 'ACTIVE', ...LIVE_USER },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  const ids = members.map((m) => m.id);
  const [breakdowns, configs] = await Promise.all([
    walletService.getWalletBreakdownsFor(ids),
    prisma.profitConfig.findMany({
      where: { userId: { in: ids }, profitType: 'MONTHLY_PERCENT', active: true },
      include: { project: { select: { title: true } } },
      orderBy: { effectiveFrom: 'desc' },
    }),
  ]);

  const byUser = new Map(ids.map((id) => [id, []]));
  for (const c of configs) {
    const next = nextCycleDate(c.monthlyProfitDay, now);
    const capital = await engine.getEligibleCapitalForDate(c.userId, c.projectId, next, c.monthlyProfitDay);
    const amount = capital > 0 ? engine.monthlyAmountFor(c, capital) : 0;
    byUser.get(c.userId).push({
      project: c.project?.title || 'General investment',
      // A fixed amount is shown as such; its % is only what it works out to.
      label: c.fixedAmount != null ? `€${c.fixedAmount}` : `${c.rate}%`,
      rate: c.fixedAmount != null && capital > 0 ? money((amount / capital) * 100) : c.rate,
      day: c.monthlyProfitDay, next, capital, amount,
    });
  }

  return members.map((m) => ({ ...m, b: breakdowns.get(m.id), plans: byUser.get(m.id) }));
}

const sum = (rows, i) => money(rows.reduce((s, r) => s + (Number(r[i]) || 0), 0));
const labelsOf = (plans) => [...new Set(plans.map((p) => p.label))];

async function membersFinancials(now) {
  const people = await loadMemberPositions(now);
  const rows = people.map(({ name, email, b, plans }) => {
    const soonest = plans.length ? plans.map((p) => p.next).sort((a, c) => a - c)[0] : null;
    return [
      name, email,
      money(b?.investedCapital), money(b?.grossProfit), money(b?.withdrawnProfit),
      money(b?.availableProfit), money(b?.totalBalance),
      plans.length ? labelsOf(plans).join(' / ') : 'Not set',
      soonest ? iso(soonest) : '',
      plans.length ? sum(plans.map((p) => [p.amount]), 0) : null,
    ];
  });
  return {
    key: 'members-financials', title: 'All members — investment, fix % & balance',
    columns: [
      { label: 'Member' }, { label: 'Email' },
      { label: 'Invested capital', type: 'eur' }, { label: 'Profit earned', type: 'eur' },
      { label: 'Withdrawn', type: 'eur' }, { label: 'Available profit', type: 'eur' },
      { label: 'Total balance', type: 'eur' }, { label: 'Monthly fix profit' },
      { label: 'Next profit date', type: 'date' }, { label: 'Next credit', type: 'eur' },
    ],
    rows,
    totals: { 2: sum(rows, 2), 3: sum(rows, 3), 4: sum(rows, 4), 5: sum(rows, 5), 6: sum(rows, 6), 9: sum(rows, 9) },
  };
}

async function monthlyForecast(now) {
  const people = await loadMemberPositions(now);
  const rows = [];
  for (const { name, email, plans } of people) {
    for (const p of plans) {
      rows.push([name, email, p.project, iso(p.next), p.capital, p.rate, p.amount]);
    }
  }
  rows.sort((a, b) => a[3].localeCompare(b[3]) || a[0].localeCompare(b[0]));
  return {
    key: 'monthly-forecast', title: 'Upcoming monthly credits',
    columns: [
      { label: 'Member' }, { label: 'Email' }, { label: 'Project' }, { label: 'Credit date', type: 'date' },
      { label: 'Eligible capital', type: 'eur' }, { label: 'Rate %', type: 'pct' }, { label: 'Amount to credit', type: 'eur' },
    ],
    rows,
    totals: { 4: sum(rows, 4), 6: sum(rows, 6) },
  };
}

async function profitCredited(now, { from, to } = {}) {
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to ? new Date(`${to}T23:59:59.999`) : now;
  const records = await prisma.profitRecord.findMany({
    where: { generatedAt: { gte: start, lte: end } },
    include: { user: { select: { name: true, email: true } }, project: { select: { title: true } } },
    orderBy: { generatedAt: 'desc' },
    take: 20000,
  });
  const rows = records.map((r) => [
    iso(r.generatedAt), r.user?.name || '', r.user?.email || '', r.project?.title || 'General investment',
    r.type === 'MONTHLY' ? 'Monthly' : r.type === 'INSURANCE' ? 'Insurance' : 'One-time', r.rate, r.capitalSnapshot, r.amount,
  ]);
  return {
    key: 'profit-credited', title: `Profit credited ${iso(start)} to ${iso(end)}`,
    columns: [
      { label: 'Date', type: 'date' }, { label: 'Member' }, { label: 'Email' }, { label: 'Project' }, { label: 'Type' },
      { label: 'Rate %', type: 'pct' }, { label: 'Capital', type: 'eur' }, { label: 'Amount', type: 'eur' },
    ],
    rows,
    totals: { 7: sum(rows, 7) },
  };
}

async function investmentsLedger() {
  const list = await prisma.walletInvestment.findMany({
    include: { user: { select: { name: true, email: true } }, project: { select: { title: true } } },
    orderBy: { investedAt: 'desc' },
    take: 20000,
  });
  const rows = list.map((i) => [
    i.user?.name || '', i.user?.email || '', i.project?.title || 'General investment', iso(i.investedAt),
    i.amount, i.returnedAmount || 0, money(i.amount - (i.returnedAmount || 0)), i.status,
  ]);
  return {
    key: 'investments', title: 'Investments ledger',
    columns: [
      { label: 'Member' }, { label: 'Email' }, { label: 'Project' }, { label: 'Invested on', type: 'date' },
      { label: 'Amount', type: 'eur' }, { label: 'Returned', type: 'eur' }, { label: 'Outstanding', type: 'eur' }, { label: 'Status' },
    ],
    rows,
    totals: { 4: sum(rows, 4), 5: sum(rows, 5), 6: sum(rows, 6) },
  };
}

async function noRate(now) {
  const people = await loadMemberPositions(now);
  const rows = people
    .filter((p) => p.plans.length === 0 && (p.b?.investedCapital || 0) > 0)
    .map((p) => [p.name, p.email, money(p.b.investedCapital), money(p.b.totalBalance)]);
  return {
    key: 'no-rate', title: 'Members without a monthly profit set',
    columns: [{ label: 'Member' }, { label: 'Email' }, { label: 'Invested capital', type: 'eur' }, { label: 'Total balance', type: 'eur' }],
    rows,
    totals: { 2: sum(rows, 2), 3: sum(rows, 3) },
  };
}

async function insuranceReport() {
  const { policies } = await require('./insurance').listAll();
  const rows = policies.map((p) => [
    p.member.name, p.member.email, p.capital, p.ratePercent, p.expectedAmount, iso(p.renewalDate), p.status,
  ]);
  return {
    key: 'insurance', title: 'Insurance policies',
    columns: [
      { label: 'Member' }, { label: 'Email' }, { label: 'Capital', type: 'eur' }, { label: 'Insurance %', type: 'pct' },
      { label: 'Amount', type: 'eur' }, { label: 'Renewal date', type: 'date' }, { label: 'Status' },
    ],
    rows,
    totals: { 2: sum(rows, 2), 4: sum(rows, 4) },
  };
}

const BUILDERS = {
  insurance: insuranceReport,
  'members-financials': membersFinancials,
  'monthly-forecast': monthlyForecast,
  'profit-credited': profitCredited,
  investments: (now) => investmentsLedger(now),
  'no-rate': noRate,
};

async function buildReport(key, opts = {}, now = new Date()) {
  const build = BUILDERS[key];
  return build ? build(now, opts) : null;
}

// ── CSV ─────────────────────────────────────────
// A spreadsheet runs a cell starting with = + - @ as a formula; a leading quote makes it text.
function cell(v) {
  if (v == null) return '';
  let s = String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function reportToCsv(report) {
  const header = report.columns.map((c) => c.label);
  const lines = [header, ...report.rows].map((r) => r.map(cell).join(','));
  if (report.totals) {
    lines.push(report.columns.map((_, i) => (i === 0 ? 'TOTAL' : report.totals[i] ?? '')).map(cell).join(','));
  }
  // BOM so Excel opens it as UTF-8.
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ── The monthly email ───────────────────────────
const SENT_KEY = 'profitReportLastSent';
const REPORT_DAY = 7;
const GRACE_DAYS = 2;   // server down on the 7th? still goes out on the 8th or 9th

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Build and send the report. Returns { sent, recipients } or { sent: false, reason }. */
async function sendMonthlyReport({ now = new Date(), actor = null } = {}) {
  const { getProfitReportRecipients } = require('./profitReportSettings');
  const mailer = require('./mailer');
  const { logActivity } = require('./activityLog');

  const { emails } = await getProfitReportRecipients();
  if (emails.length === 0) return { sent: false, reason: 'no-recipients' };

  const [financials, forecast] = await Promise.all([membersFinancials(now), monthlyForecast(now)]);
  await mailer.sendMonthlyProfitReportEmail({
    to: emails, financials, forecast, now,
    attachments: [
      { filename: `members-${monthKey(now)}.csv`, content: reportToCsv(financials), contentType: 'text/csv; charset=utf-8' },
      { filename: `upcoming-credits-${monthKey(now)}.csv`, content: reportToCsv(forecast), contentType: 'text/csv; charset=utf-8' },
    ],
  });

  logActivity({
    type: 'PROFIT_REPORT_SENT',
    title: `Monthly members report sent · ${financials.rows.length} members`,
    description: `To ${emails.join(', ')}`,
    actorId: actor?.id, actorName: actor?.name || 'System',
    metadata: { recipients: emails, members: financials.rows.length, credits: forecast.rows.length, manual: Boolean(actor) },
  });
  return { sent: true, recipients: emails, members: financials.rows.length };
}

/** Called by the worker: sends once per month, on the 7th (or within the grace window after it). */
async function sendDueMonthlyReport(now = new Date()) {
  const day = now.getDate();
  if (day < REPORT_DAY || day >= REPORT_DAY + GRACE_DAYS + 1) return { sent: false, reason: 'not-due' };

  const row = await prisma.systemConfig.findUnique({ where: { key: SENT_KEY } });
  if (row?.value === monthKey(now)) return { sent: false, reason: 'already-sent' };

  // Claim the month before sending: a failed mail is logged by sendMail, and
  // retrying hourly for two days would be worse than the manual "send now".
  await prisma.systemConfig.upsert({
    where: { key: SENT_KEY }, update: { value: monthKey(now) }, create: { key: SENT_KEY, value: monthKey(now) },
  });
  return sendMonthlyReport({ now });
}

module.exports = {
  CATALOGUE, REPORT_DAY, buildReport, reportToCsv, sendMonthlyReport, sendDueMonthlyReport, nextCycleDate,
};
