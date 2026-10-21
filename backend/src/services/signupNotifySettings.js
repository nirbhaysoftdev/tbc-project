// src/services/signupNotifySettings.js
//
// The addresses that are told when a new member signs up.
//
// This was `ADMIN_NOTIFY_EMAIL` in the environment: one address, set at deploy
// time, invisible from the portal, and silently off whenever the variable was
// missing — which is exactly how a production portal can take applications for
// a week with nobody watching. It is now a setting in Admin → Super Admin,
// several addresses are supported, and the variable is kept as the fallback so
// an existing deployment keeps working unchanged.
//
// Same machinery as the enquiry recipients — see recipientList.js.
const {
  MAX_RECIPIENTS, isEmail, parseRecipients, recipientSetting,
} = require('./recipientList');

const setting = recipientSetting({
  key:      'signupNotifyEmail',
  // No hardcoded default here, unlike enquiries. An enquiry is a member's
  // message and must never be dropped; a signup notification is internal, and
  // mailing it to an address nobody chose is worse than not sending it. With
  // neither the setting nor the variable present, the list is empty and the
  // mailer skips the send.
  fallback: () => process.env.ADMIN_NOTIFY_EMAIL || '',
});

module.exports = {
  CONFIG_KEY: setting.CONFIG_KEY,
  MAX_RECIPIENTS,
  getSignupNotifyRecipients: setting.get,
  setSignupNotifyRecipients: setting.set,
  parseRecipients,
  isEmail,
};
