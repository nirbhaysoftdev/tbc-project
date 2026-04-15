// src/services/kpiService.js
// KPI scoring: tracks member engagement and updates running summary
const prisma = require('../utils/prismaClient');

const KPI_SCORES = {
  login:               1,
  investment:         10,
  referral:           20,
  event_participation: 5,
};

/**
 * Log a KPI action for a user and update their total_score.
 * @param {string} userId
 * @param {string} actionType  – login | investment | referral | event_participation
 * @param {object} metadata    – optional extra data stored as JSON
 * @returns {Promise<number>}  the score awarded for this action
 */
const logKpiAction = async (userId, actionType, metadata = {}) => {
  const score = KPI_SCORES[actionType] ?? 0;
  if (score === 0) return 0;

  await prisma.userKpiLog.create({
    data: { userId, actionType, score, metadata },
  });

  await prisma.userKpiSummary.upsert({
    where:  { userId },
    update: { totalScore: { increment: score } },
    create: { userId, totalScore: score },
  });

  return score;
};

/**
 * Get the KPI summary for a user (total score + recent logs).
 */
const getKpiSummary = async (userId) => {
  const [summary, logs] = await Promise.all([
    prisma.userKpiSummary.findUnique({ where: { userId } }),
    prisma.userKpiLog.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    20,
    }),
  ]);
  return { summary: summary ?? { userId, totalScore: 0 }, logs };
};

module.exports = { logKpiAction, getKpiSummary };
