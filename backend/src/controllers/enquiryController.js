// src/controllers/enquiryController.js
//
// Connect Now / Enquire Now: a member sends a message about a project or a
// company, and it is delivered to the portal's configured enquiry recipient.
//
// This replaces published contact details. Members no longer see a company's
// email address or phone number anywhere in the portal (see the public
// projections in companiesController.js and projectsController.js) — they go
// through here instead, which means the portal keeps a record of who asked
// what, and a company's address is never harvested from a profile page.
//
// Three things in here are deliberate and worth not undoing:
//
//  1. The member's identity comes from `req.user`, which came from the signed
//     session token. The name and email in the modal are read-only as a
//     convenience; any identity fields in the request body are ignored
//     outright. A caller cannot send an enquiry as somebody else.
//
//  2. The recipients are a portal-wide LIST (services/enquirySettings.js) and
//     every address on it receives every enquiry. They are
//     resolved on the server and never accepted from the client — that would
//     turn this endpoint into an open relay for sending mail from the portal's
//     own domain to anywhere. It is deliberately not per project or per
//     company: that had to be set again on every item an admin created, and
//     answering "where do enquiries go?" meant opening every record.
//
//  3. The enquiry row is written BEFORE the email is attempted and updated
//     with the outcome. A delivery failure therefore leaves a FAILED record
//     that can be chased, rather than disappearing with the request.
const prisma = require('../utils/prismaClient');
const sanitizeHtml = require('sanitize-html');
const { sendEnquiryEmail, sendEnquiryRecipientChangedEmails } = require('../services/mailer');
const { logActivity } = require('../services/activityLog');
const {
  getEnquiryRecipients, setEnquiryRecipients, MAX_RECIPIENTS,
} = require('../services/enquirySettings');

const MESSAGE_MIN = 5;
const MESSAGE_MAX = 4000;

// Throttles, on top of the route's IP rate limiter. These are per MEMBER, which
// is the thing that actually matters: a rate limit keyed on IP alone is both
// evaded by a phone switching networks and tripped by an office sharing one.
const WINDOW_MINUTES = 10;
const MAX_PER_WINDOW = 5;      // enquiries per member per 10 minutes
const DUPLICATE_MINUTES = 2;   // identical message to the same target

/**
 * The member's message, as plain text.
 *
 * Markup is stripped rather than escaped: this is a message field, not a rich
 * text field, and the only reason HTML would be in it is to smuggle a link or
 * a script into the notification email. The email template escapes what
 * survives as well — two layers, because this value ends up in someone's inbox
 * and that recipient is not necessarily running a hardened client.
 */
const cleanMessage = (raw) => {
  if (typeof raw !== 'string') return '';
  const stripped = sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} });
  return stripped
    .replace(/\r\n/g, '\n')
    // Collapse runs of blank lines, so a message cannot be padded into
    // something enormous with newlines alone.
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MESSAGE_MAX);
};

// ── Create an enquiry ─────────────────────────
const createEnquiry = async (req, res) => {
  try {
    const { projectId, companyId } = req.body;

    // Exactly one target. Both or neither is a malformed request, not
    // something to guess at.
    if ((projectId && companyId) || (!projectId && !companyId)) {
      return res.status(400).json({ error: 'Send an enquiry about either a project or a company.' });
    }

    const message = cleanMessage(req.body.message);
    if (!message || message.length < MESSAGE_MIN) {
      return res.status(400).json({ error: 'Please write a message before sending.' });
    }

    // ── Resolve the target, and its recipient ──
    const kind = companyId ? 'COMPANY' : 'PROJECT';
    let subjectName;

    if (kind === 'COMPANY') {
      const company = await prisma.company.findUnique({
        where:  { id: companyId },
        select: { id: true, name: true, status: true },
      });
      if (!company) return res.status(404).json({ error: 'Company not found' });
      // A member may only enquire about something they can actually see. A
      // draft or archived profile is not in the directory, so an enquiry about
      // one would be a message about a page that does not exist for them.
      if (req.user.role !== 'ADMIN' && !['ACTIVE', 'INACTIVE'].includes(company.status)) {
        return res.status(404).json({ error: 'Company not found' });
      }
      subjectName = company.name;
    } else {
      const project = await prisma.project.findUnique({
        where:  { id: projectId },
        select: { id: true, title: true, status: true },
      });
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (req.user.role !== 'ADMIN' && !['ACTIVE', 'FUNDED', 'CLOSED'].includes(project.status)) {
        return res.status(404).json({ error: 'Project not found' });
      }
      subjectName = project.title;
    }

    // The portal-wide recipients, resolved here on the server. A recipient in
    // the request body is ignored — see the header note about open relays. An
    // unset or invalid setting falls back to DEFAULT_ENQUIRY_EMAIL rather than
    // failing the member's submission: a misconfiguration is not their
    // problem, and an enquiry must never be silently dropped.
    //
    // Every configured address receives the same message.
    const { emails: recipientEmails } = await getEnquiryRecipients();
    // The enquiry record keeps the list it actually went to, comma-joined. The
    // configured recipients can change afterwards, so this is the audit trail
    // of where this particular message was delivered.
    const recipientEmail = recipientEmails.join(', ');

    // ── Throttles ──
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
    const recent = await prisma.enquiry.findMany({
      where:  { memberId: req.user.id, createdAt: { gte: since } },
      select: { message: true, projectId: true, companyId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_PER_WINDOW,
    });

    if (recent.length >= MAX_PER_WINDOW) {
      return res.status(429).json({
        error: `You have sent several enquiries just now. Please wait a few minutes before sending another.`,
      });
    }

    // The same message to the same target twice in quick succession is a
    // double-click or a retry, not two enquiries. The client also disables its
    // button while the request is in flight; this is the half that holds when
    // the client is not the one we shipped.
    const duplicateSince = new Date(Date.now() - DUPLICATE_MINUTES * 60 * 1000);
    const duplicate = recent.find((e) =>
      e.message === message
      && e.createdAt >= duplicateSince
      && (kind === 'COMPANY' ? e.companyId === companyId : e.projectId === projectId));

    if (duplicate) {
      // Reported as success: the member's message HAS been delivered, and
      // telling them it failed would invite a third attempt.
      return res.status(200).json({
        message: 'Your message has been delivered successfully. The concerned team will connect with you soon.',
        duplicate: true,
      });
    }

    // ── Record first, then deliver ──
    const enquiry = await prisma.enquiry.create({
      data: {
        memberId:  req.user.id,
        projectId: kind === 'PROJECT' ? projectId : null,
        companyId: kind === 'COMPANY' ? companyId : null,
        subjectName,
        message,
        recipientEmail,
        status: 'PENDING',
      },
    });

    try {
      await sendEnquiryEmail({
        // An array: nodemailer addresses all of them on one message, so the
        // recipients can see each other and reply-all to the member.
        to: recipientEmails,
        // From the session, not the request body.
        member:  { name: req.user.name, email: req.user.email },
        subjectName,
        kind,
        message,
        submittedAt: enquiry.createdAt,
      });

      await prisma.enquiry.update({
        where: { id: enquiry.id },
        data:  { status: 'SENT', sentAt: new Date() },
      });

      logActivity({
        type:        'ENQUIRY_SENT',
        title:       `Enquiry sent: ${subjectName}`,
        description: `${req.user.name} enquired about ${subjectName}`,
        actorId:     req.user.id,
        actorName:   req.user.name,
        // The recipient address is NOT logged: the activity feed is read in the
        // admin UI and this is an internal routing address.
        metadata:    { enquiryId: enquiry.id, kind, projectId: projectId || null, companyId: companyId || null },
      });

      return res.status(201).json({
        message: 'Your message has been delivered successfully. The concerned team will connect with you soon.',
        enquiryId: enquiry.id,
      });
    } catch (err) {
      // The enquiry is kept as FAILED so it is visible and recoverable. The
      // member is told plainly that it did not go out, rather than being shown
      // a success message for something sitting in a failed state.
      console.error('enquiry delivery failed:', err.message);
      await prisma.enquiry.update({
        where: { id: enquiry.id },
        data:  { status: 'FAILED', error: String(err.message || 'unknown').slice(0, 500) },
      }).catch(() => {});

      return res.status(502).json({
        error: 'Your message could not be delivered just now. Please try again in a few minutes.',
        enquiryId: enquiry.id,
      });
    }
  } catch (err) {
    console.error('createEnquiry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Admin: the portal-wide recipient ──────────
// One address for every project and every company. `source` tells the admin
// screen whether anyone has actually configured it or whether the environment
// default is still in use — the two look identical otherwise.
const getRecipient = async (req, res) => {
  try {
    const current = await getEnquiryRecipients();
    res.json({
      emails:    current.emails,
      // `email` is kept alongside `emails` so anything written against the
      // single-address version of this endpoint still reads correctly.
      email:     current.emails[0],
      source:    current.source,          // 'config' | 'default'
      updatedAt: current.updatedAt,
      max:       MAX_RECIPIENTS,
      // Shown as the value that applies when the setting is cleared.
      fallback:  process.env.DEFAULT_ENQUIRY_EMAIL || 'codehands12@gmail.com',
    });
  } catch (err) {
    console.error('getRecipient error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateRecipient = async (req, res) => {
  try {
    // `emails` is the list; `email` is accepted too, so the single-address
    // shape of this endpoint keeps working.
    const submitted = req.body.emails !== undefined ? req.body.emails : req.body.email;

    let change;
    try {
      change = await setEnquiryRecipients(submitted);
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

    // The setting is saved by this point. The notifications are deliberately
    // after it and deliberately cannot fail the request: an admin's change
    // must not appear to have been rejected because a mailbox was unreachable.
    const notified = unchanged
      ? { notifiedAdded: [], notifiedRemoved: [], failed: [] }
      : await sendEnquiryRecipientChangedEmails({
          added:         change.added,
          removed:       change.removed,
          currentEmails: change.current,
          actorName:     req.user.name,
        });

    if (!unchanged) {
      logActivity({
        type:        'ENQUIRY_RECIPIENT_CHANGED',
        title:       'Enquiry recipients changed',
        description: `${req.user.name} set the enquiry recipients to ${change.current.join(', ')}`,
        actorId:     req.user.id,
        actorName:   req.user.name,
        metadata:    {
          from: change.previousSource === 'config' ? change.previous : null,
          to:   change.current,
          added: change.added,
          removed: change.removed,
          notified,
        },
      });
    }

    res.json({
      emails:   change.current,
      email:    change.current[0],
      source:   'config',
      previous: change.previousSource === 'config' ? change.previous : null,
      added:    change.added,
      removed:  change.removed,
      unchanged,
      notified,
    });
  } catch (err) {
    console.error('updateRecipient error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Admin: list enquiries ─────────────────────
// The record side of the feature: who asked about what, where it was sent and
// whether it arrived. Admin-only — an enquiry contains another member's message
// and the internal recipient address.
const listEnquiries = async (req, res) => {
  try {
    const { status, projectId, companyId, page = 1, limit = 25 } = req.query;

    const where = {};
    if (status && ['PENDING', 'SENT', 'FAILED'].includes(status)) where.status = status;
    if (projectId) where.projectId = projectId;
    if (companyId) where.companyId = companyId;

    const take = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [enquiries, total] = await Promise.all([
      prisma.enquiry.findMany({
        where,
        include: {
          member:  { select: { id: true, name: true, email: true } },
          project: { select: { id: true, title: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.enquiry.count({ where }),
    ]);

    res.json({
      enquiries,
      pagination: { page: Math.max(parseInt(page, 10) || 1, 1), limit: take, total },
    });
  } catch (err) {
    console.error('listEnquiries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createEnquiry, listEnquiries, getRecipient, updateRecipient };
