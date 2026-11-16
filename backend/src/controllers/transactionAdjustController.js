// src/controllers/transactionAdjustController.js
// Super admin only (routes/superAdmin.js): edit or undo a transaction. See
// services/transactionAdjust.js for what each category does to the ledger.
const adjust = require('../services/transactionAdjust');

const fail = (res, err) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
};

const edit = async (req, res) => {
  try {
    const { amount, date, reason } = req.body;
    res.json({ transaction: await adjust.edit({ id: req.params.id, amount, date, reason, actor: req.user }) });
  } catch (err) { fail(res, err); }
};

const undo = async (req, res) => {
  try {
    res.json({ transaction: await adjust.undo({ id: req.params.id, reason: req.body.reason, actor: req.user }) });
  } catch (err) { fail(res, err); }
};

module.exports = { edit, undo };
