// Credits monthly fixed profit on each member's configured day. No queue table:
// the engine's unique (user, scope, period) row makes every pass idempotent, so
// the worker only has to ask "what is due?" on an interval.
const engine = require('./investmentEngine');
const { logActivity } = require('./activityLog');

const CONFIG = {
  enabled: process.env.MONTHLY_PROFIT_WORKER !== 'off',
  intervalMs: parseInt(process.env.MONTHLY_PROFIT_INTERVAL_MS, 10) || 60 * 60 * 1000,
};

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const { credited } = await engine.generateDueMonthlyProfits();
    // One entry per member credited, so it shows on that member's trail with
    // the amount, the same as a manually given profit.
    for (const rec of credited) {
      logActivity({
        type: 'PROFIT_MONTHLY_GENERATED',
        title: `Monthly profit credited · ${Number(rec.amount).toLocaleString()}`,
        description: `Automatic run · period ${rec.period} · ${rec.rate}% on ${Number(rec.capitalSnapshot).toLocaleString()}`,
        actorName: 'System',
        targetId: rec.userId,
        amount: rec.amount,
        metadata: { profitRecordId: rec.id, projectId: rec.projectId, period: rec.period, rate: rec.rate, scheduled: true },
      });
    }
  } catch (err) {
    console.error('[monthly-profit] run failed:', err);
  } finally {
    running = false;
  }
}

function start() {
  if (!CONFIG.enabled || timer) return;
  setTimeout(() => { void tick(); }, 30 * 1000).unref?.();
  timer = setInterval(() => { void tick(); }, CONFIG.intervalMs);
  timer.unref?.();
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { start, stop, tick };
