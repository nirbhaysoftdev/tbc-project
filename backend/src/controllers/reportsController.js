// src/controllers/reportsController.js
//
// Super Admin → Reports. Every route is behind requireSuperAdmin (routes/
// superAdmin.js): these payloads carry every member's email and balance.
const memberReports = require('../services/memberReports');
const settings = require('../services/profitReportSettings');
const { logActivity } = require('../services/activityLog');

const catalogue = (req, res) => res.json({ reports: memberReports.CATALOGUE, reportDay: memberReports.REPORT_DAY });

// GET /reports/:key?from=&to=&format=json|csv
const run = async (req, res) => {
  try {
    const { from, to, format } = req.query;
    const report = await memberReports.buildReport(req.params.key, { from, to });
    if (!report) return res.status(404).json({ error: 'Unknown report' });

    if (format === 'csv') {
      logActivity({
        type: 'REPORT_DOWNLOADED', title: `Report downloaded · ${report.title}`,
        actorId: req.user.id, actorName: req.user.name,
        metadata: { report: report.key, rows: report.rows.length, from: from || null, to: to || null },
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.key}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(memberReports.reportToCsv(report));
    }
    res.json(report);
  } catch (err) {
    console.error('report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getRecipients = async (req, res) => {
  try {
    const cur = await settings.getProfitReportRecipients();
    res.json({
      emails: cur.emails, source: cur.source, updatedAt: cur.updatedAt, max: settings.MAX_RECIPIENTS,
      fallback: process.env.PROFIT_REPORT_EMAIL || '', reportDay: memberReports.REPORT_DAY,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateRecipients = async (req, res) => {
  try {
    let change;
    try {
      change = await settings.setProfitReportRecipients(req.body.emails !== undefined ? req.body.emails : req.body.email);
    } catch (err) {
      if (err.invalid?.length) return res.status(400).json({ error: `Not valid email addresses: ${err.invalid.join(', ')}` });
      return res.status(400).json({ error: 'At least one email address is required.' });
    }
    const unchanged = change.added.length === 0 && change.removed.length === 0;
    if (!unchanged) {
      logActivity({
        type: 'PROFIT_REPORT_EMAIL_CHANGED', title: 'Monthly report recipients changed',
        description: `${req.user.name} set the monthly report recipients to ${change.current.join(', ')}`,
        actorId: req.user.id, actorName: req.user.name,
        metadata: { to: change.current, added: change.added, removed: change.removed },
      });
    }
    res.json({ emails: change.current, source: 'config', unchanged });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /reports/monthly/send-now — the same email the 7th sends, on demand.
const sendNow = async (req, res) => {
  try {
    const result = await memberReports.sendMonthlyReport({ actor: req.user });
    if (!result.sent) return res.status(400).json({ error: 'Add a recipient email first.' });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send the report.' });
  }
};

module.exports = { catalogue, run, getRecipients, updateRecipients, sendNow };
