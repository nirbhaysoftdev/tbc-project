// src/services/profitReportSettings.js
//
// The addresses that receive the monthly members' profit report on the 7th.
// Same machinery as the enquiry and signup recipients — see recipientList.js.
const {
  MAX_RECIPIENTS, isEmail, parseRecipients, recipientSetting,
} = require('./recipientList');

const setting = recipientSetting({
  key: 'profitReportEmail',
  // No hardcoded default: the report lists every member's balance, so it goes
  // only to an address somebody chose. Neither setting nor variable = not sent.
  fallback: () => process.env.PROFIT_REPORT_EMAIL || '',
});

module.exports = {
  MAX_RECIPIENTS,
  getProfitReportRecipients: setting.get,
  setProfitReportRecipients: setting.set,
  parseRecipients,
  isEmail,
};
