// src/controllers/signupNotifyController.js
//
// Read and write the addresses that are told when a new member signs up.
// Deliberately the same shape as the enquiry recipient endpoints in
// enquiryController, so the two settings screens behave identically.
//
// Reading is open to any admin — knowing where application alerts go is part
// of doing the job. Writing is super admin only, enforced on the route: an
// ADMIN who could redirect the alerts could approve their own invitee
// unobserved.
const { logActivity } = require('../services/activityLog');
const {
  getSignupNotifyRecipients, setSignupNotifyRecipients, MAX_RECIPIENTS,
} = require('../services/signupNotifySettings');

const getRecipients = async (req, res) => {
  try {
    const current = await getSignupNotifyRecipients();
    res.json({
      emails:    current.emails,
      source:    current.source,          // 'config' | 'default'
      updatedAt: current.updatedAt,
      max:       MAX_RECIPIENTS,
      // What applies when the setting is cleared. Empty is a real answer here,
      // and the screen says so: nobody is told about new applications.
      fallback:  process.env.ADMIN_NOTIFY_EMAIL || '',
    });
  } catch (err) {
    console.error('getRecipients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateRecipients = async (req, res) => {
  try {
    const submitted = req.body.emails !== undefined ? req.body.emails : req.body.email;

    let change;
    try {
      change = await setSignupNotifyRecipients(submitted);
    } catch (err) {
      if (err.invalid?.length) {
        return res.status(400).json({
          error: err.invalid.length === 1
            ? `“${err.invalid[0]}” is not a valid email address.`
            : `These are not valid email addresses: ${err.invalid.join(', ')}`,
        });
      }
      return res.status(400).json({ error: 'At least one email address is required.' });
    }

    const unchanged = change.added.length === 0 && change.removed.length === 0;

    // No "you were added" mail is sent, unlike the enquiry recipients. That
    // notice exists because an enquiry recipient is often someone outside the
    // portal who needs telling; these addresses belong to admins who are
    // looking at the screen that changed them. The activity log is the record.
    if (!unchanged) {
      logActivity({
        type:        'SIGNUP_NOTIFY_CHANGED',
        title:       'New-signup notification recipients changed',
        description: `${req.user.name} set the new-signup recipients to ${change.current.join(', ')}`,
        actorId:     req.user.id,
        actorName:   req.user.name,
        metadata:    {
          from:    change.previousSource === 'config' ? change.previous : null,
          to:      change.current,
          added:   change.added,
          removed: change.removed,
        },
      });
    }

    res.json({
      emails:   change.current,
      source:   'config',
      previous: change.previousSource === 'config' ? change.previous : null,
      added:    change.added,
      removed:  change.removed,
      unchanged,
    });
  } catch (err) {
    console.error('updateRecipients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getRecipients, updateRecipients };
