// src/controllers/activityLogController.js
// Read side of the activity feed that backs the admin Logs page.
const prisma = require('../utils/prismaClient');
const { ACTIVITY, CATEGORIES } = require('../services/activityLog');

/**
 * GET /api/admin/logs
 * Filters: type, category, status, search, userId, from, to, page, limit.
 * `type` and `category` accept a comma-separated list.
 */
const listLogs = async (req, res) => {
  try {
    const {
      type, category, status, search, userId,
      from, to, page = 1, limit = 50,
    } = req.query;

    const take = Math.min(parseInt(limit) || 50, 200);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const where = {};
    const list = (v) => String(v).split(',').map((x) => x.trim()).filter(Boolean);

    if (type)     where.type     = { in: list(type) };
    if (category) where.category = { in: list(category) };
    if (status)   where.status   = status;
    if (userId)   where.OR       = [{ targetId: userId }, { actorId: userId }];

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      // `to` is a plain date from the UI, so include the whole day.
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.AND = [{
        OR: [
          { title:       { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { actorName:   { contains: search, mode: 'insensitive' } },
          { targetName:  { contains: search, mode: 'insensitive' } },
        ],
      }];
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          actor:  { select: { id: true, name: true, email: true } },
          target: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: { page: parseInt(page) || 1, limit: take, total, pages: Math.ceil(total / take) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/admin/logs/types
 * The filter catalogue plus how many logs each type/category currently holds,
 * so the UI can hide filters that would return nothing.
 */
const listLogTypes = async (req, res) => {
  try {
    const grouped = await prisma.activityLog.groupBy({
      by: ['type'],
      _count: { _all: true },
    });
    const counts = Object.fromEntries(grouped.map((g) => [g.type, g._count._all]));

    const types = Object.entries(ACTIVITY).map(([type, def]) => ({
      type,
      label:    def.label,
      category: def.category,
      count:    counts[type] || 0,
    }));

    const categories = CATEGORIES.map((category) => ({
      category,
      count: types.filter((t) => t.category === category)
                  .reduce((sum, t) => sum + t.count, 0),
    }));

    res.json({ types, categories, total: types.reduce((s, t) => s + t.count, 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { listLogs, listLogTypes };
