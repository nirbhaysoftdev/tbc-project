// src/controllers/insuranceController.js
//
// Setting up is an admin action (from the member's page); everything that
// changes an existing policy, and the full list, is super admin only. The
// routes enforce that - see routes/admin.js and routes/superAdmin.js.
const insurance = require('../services/insurance');

const fail = (res, err) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
};

// Records an insurance credit for a date and a %, and sets the yearly renewal.
// Repeating it is "add one more insurance".
const setUp = async (req, res) => {
  try {
    const policy = await insurance.addCredit({
      userId: req.params.id, ratePercent: req.body.ratePercent, date: req.body.date, actor: req.user,
    });
    res.status(201).json({ insurance: policy });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try { res.json(await insurance.listAll()); } catch (err) { fail(res, err); }
};

const update = async (req, res) => {
  try {
    const { ratePercent, renewalDate, status } = req.body;
    const policy = await insurance.update({ userId: req.params.userId, ratePercent, renewalDate, status, actor: req.user });
    res.json({ insurance: policy });
  } catch (err) { fail(res, err); }
};

// The member's own policy, for their dashboard and transactions page.
const mine = async (req, res) => {
  try {
    const policy = await insurance.getForUser(req.user.id);
    res.json({ insurance: policy && {
      ratePercent: policy.ratePercent, renewalDate: policy.renewalDate, status: policy.status,
      capital: policy.capital, expectedAmount: policy.expectedAmount,
      lastCreditedAt: policy.lastCreditedAt, lastCreditedAmount: policy.lastCreditedAmount,
    } });
  } catch (err) { fail(res, err); }
};

module.exports = { setUp, list, update, mine };
