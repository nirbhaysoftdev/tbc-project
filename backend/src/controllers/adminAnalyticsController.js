// src/controllers/adminAnalyticsController.js
//
// Read side of the admin Overview. All of the arithmetic is in
// services/adminAnalytics.js; this parses the window and answers.
//
// There is no write side and no cache: every figure is derived from the ledger
// on each request, so the Overview cannot drift from a member's own wallet.
const analytics = require('../services/adminAnalytics');

/**
 * GET /api/admin/analytics
 *
 * Query: range=all|month|quarter|year|custom, from, to, granularity.
 *   `from`/`to` apply to `range=custom` only; `granularity` overrides the
 *   bucket size that is otherwise chosen from the width of the window.
 */
const getOverview = async (req, res) => {
  const range = analytics.resolveRange(req.query);
  if (range.error) return res.status(400).json({ error: range.error });

  try {
    const data = await analytics.overview(range);
    res.json({
      ...data,
      // Echoed so the UI can label the chart with the window it actually got
      // rather than the one it believes it asked for - they differ whenever a
      // granularity is auto-chosen.
      range: {
        key: range.key,
        from: range.from,
        to: range.to,
        granularity: range.granularity,
      },
      ranges: analytics.RANGES,
      granularities: analytics.GRANULARITIES,
    });
  } catch (err) {
    console.error('getOverview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getOverview };
