// src/controllers/eventFeedController.js
//
// Read side of the admin event feed. All of the shaping lives in
// services/eventFeed.js; these two handlers parse, delegate and answer.
//
// There is no write side. Every event in the feed is created by the flow that
// owns it - registration (authController), withdrawal (withdrawController),
// enquiry (enquiryController) - and nothing here can invent one.
const feed = require('../services/eventFeed');
const { maySeeSensitive } = require('../middleware/apiKey');

/**
 * GET /api/admin/events
 *
 * Query: kind, status, memberId, q, since, until, page, limit.
 *   kind     comma-separated: SIGNUP, WITHDRAWAL, ENQUIRY (default: all three)
 *   status   matched per kind; a kind that cannot hold it contributes nothing
 *   since    EXCLUSIVE lower bound - send back the `latestAt` of the last poll
 *   until    inclusive upper bound, for walking backwards through history
 */
const listEvents = async (req, res) => {
  const parsed = feed.parseQuery(req.query);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const result = await feed.listEvents(parsed.filters, {
      page: parsed.page, limit: parsed.limit,
    });

    // An admin session sees everything. A key sees everything only if it was
    // granted `events:sensitive`; otherwise the identifying detail never
    // reaches the response. Done here, once, at the edge - no caller can
    // forget it by building a payload of its own.
    const full = maySeeSensitive(req);
    const events = full ? result.events : result.events.map(feed.redactEvent);

    res.json({
      events,
      counts:     result.counts,
      pagination: result.pagination,
      // `null` when the filtered set is empty: a poller keeps the `since` it
      // already had rather than resetting to now and skipping an event that
      // lands in between.
      latestAt:   result.latestAt,
      kinds:      feed.KINDS,
      statuses:   feed.STATUSES,
      // Said out loud, so a consumer knows whether a missing field is absent
      // or withheld, and which scope would return it.
      redacted:   !full,
      ...(req.apiKey ? { key: { name: req.apiKey.name, scopes: req.apiKey.scopes } } : {}),
    });
  } catch (err) {
    console.error('listEvents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * GET /api/admin/events/counts
 *
 * The same filters, counted and nothing more - three COUNT(*)s, no rows and no
 * payloads. This is what a notification badge polls.
 */
const countEvents = async (req, res) => {
  const parsed = feed.parseQuery(req.query);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const { counts, needsAttention } = await feed.countEvents(parsed.filters);
    // Counts carry no personal data at any scope, so there is nothing here to
    // redact.
    res.json({ counts, needsAttention, kinds: feed.KINDS });
  } catch (err) {
    console.error('countEvents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { listEvents, countEvents };
