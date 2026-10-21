// src/services/enquirySettings.js
//
// The addresses that Connect Now / Enquire Now messages are delivered to, for
// every project and every company in the portal.
//
// It is portal-wide on purpose. It was briefly per-project and per-company,
// which meant the address had to be set again on every item an admin created
// and there was no way to answer "where do enquiries go?" without opening
// every record. One setting, changed in one place, is what this actually
// needs.
//
// SEVERAL addresses are supported, and every one of them receives every
// enquiry — they are recipients of the same message, not a rota. A team with a
// shared inbox and two partners who both want to see new interest is the case
// this exists for.
//
// The storage, parsing and change-tracking live in recipientList.js, which
// signupNotifySettings.js uses for the same job. `DEFAULT_ENQUIRY_EMAIL` in
// the environment remains the fallback for a portal where nobody has set one
// yet, so enquiries can never be dropped for want of configuration.
const {
  MAX_RECIPIENTS, isEmail, parseRecipients, recipientSetting,
} = require('./recipientList');

const setting = recipientSetting({
  key:      'enquiryRecipientEmail',
  fallback: () => process.env.DEFAULT_ENQUIRY_EMAIL || 'codehands12@gmail.com',
});

module.exports = {
  CONFIG_KEY: setting.CONFIG_KEY,
  MAX_RECIPIENTS,
  getEnquiryRecipients: setting.get,
  setEnquiryRecipients: setting.set,
  parseRecipients,
  isEmail,
};
