// src/services/mailer.js
// SMTP transport for portal@trillionbusinesscommunity.com
const nodemailer = require('nodemailer');

let cachedTransport = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;
  const {
    SMTP_HOST,
    SMTP_PORT = '465',
    SMTP_SECURE = 'true',
    SMTP_USER,
    SMTP_PASSWORD,
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('SMTP credentials missing. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in .env');
  }

  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  return cachedTransport;
}

async function sendMail({ to, subject, html, text }) {
  const from = `"${process.env.SMTP_FROM_NAME || 'TBC'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;
  const info = await getTransport().sendMail({ from, to, subject, html, text });
  return info;
}

// ── Shared brand shell ─────────────────────────
function shell({ title, intro, bodyHtml, footerNote }) {
  return `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#0b0f19;font-family:'Helvetica Neue',Arial,sans-serif;color:#e6e8ee;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f19;padding:40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#12172a,#0b0f19);border:1px solid rgba(200,168,75,0.25);border-radius:16px;padding:36px 40px;">
              <tr>
                <td align="center" style="padding-bottom:20px;">
                  <div style="font-size:12px;letter-spacing:3px;color:#c8a84b;font-weight:600;">TRILLION BUSINESS COMMUNITY</div>
                </td>
              </tr>
              <tr>
                <td style="font-family:Georgia,serif;font-size:24px;color:#fff;padding-bottom:8px;">${title}</td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#aab0c0;padding-bottom:20px;">
                  ${intro}
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0 20px;">${bodyHtml}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#5c6479;padding-top:24px;border-top:1px solid rgba(255,255,255,0.05);">
                  ${footerNote || 'This is an automated message from Trillion Business Community.'}
                </td>
              </tr>
            </table>
            <div style="font-size:11px;color:#5c6479;padding-top:16px;">© ${new Date().getFullYear()} Trillion Business Community</div>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

function goldButton(href, label) {
  return `
    <a href="${href}" style="display:inline-block;padding:12px 26px;border-radius:10px;background:#c8a84b;color:#0b0f19;font-weight:700;text-decoration:none;letter-spacing:0.5px;">
      ${label}
    </a>`;
}

function detailRow(label, value) {
  return `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#7a819a;font-size:13px;">${label}</td>
      <td style="padding:6px 0;color:#e6e8ee;font-size:13px;">${value}</td>
    </tr>`;
}

// ── OTP (existing) ─────────────────────────────
function otpEmailHtml({ code, expiresMinutes }) {
  const body = `
    <div style="text-align:center;">
      <div style="display:inline-block;padding:18px 28px;border-radius:14px;background:rgba(200,168,75,0.12);border:1px solid rgba(200,168,75,0.35);font-family:'Courier New',monospace;font-size:34px;letter-spacing:12px;color:#c8a84b;font-weight:700;">
        ${code}
      </div>
    </div>
    <div style="font-size:13px;color:#7a819a;padding-top:20px;">
      This code expires in <strong style="color:#c8a84b;">${expiresMinutes} minutes</strong>.
    </div>`;
  return shell({
    title: 'Verify your email',
    intro: 'Use the one-time code below to confirm your email address and continue your membership application.',
    bodyHtml: body,
    footerNote: "If you didn't request this code, you can safely ignore this email.",
  });
}

async function sendOtpEmail(email, code, expiresMinutes = 10) {
  return sendMail({
    to: email,
    subject: `Your TBC verification code: ${code}`,
    text: `Your TBC email verification code is ${code}. It expires in ${expiresMinutes} minutes.`,
    html: otpEmailHtml({ code, expiresMinutes }),
  });
}

// ── Welcome / pending review (to the user) ─────
function welcomePendingHtml({ name }) {
  const body = `
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;">
      Hi ${name || 'there'}, thank you for applying to join <strong style="color:#c8a84b;">Trillion Business Community</strong>.
    </div>
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;padding-top:12px;">
      Your account is now in <strong style="color:#c8a84b;">pending review</strong>. Our team will verify your details and notify you by email as soon as your membership is approved. You won't have full portal access until then.
    </div>`;
  return shell({
    title: 'Application received',
    intro: 'We have received your membership application and it is now under review.',
    bodyHtml: body,
    footerNote: "You will receive another email as soon as our team completes the review.",
  });
}

async function sendWelcomePendingEmail(user) {
  return sendMail({
    to: user.email,
    subject: 'Your TBC membership application is under review',
    text: `Hi ${user.name || ''}, thank you for applying to join Trillion Business Community. Your account is pending admin review — we will email you as soon as it is approved.`,
    html: welcomePendingHtml({ name: user.name }),
  });
}

// ── Approval (to the user) ─────────────────────
function accountApprovedHtml({ name, tier, loginUrl }) {
  const body = `
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;">
      Hi ${name || 'there'}, congratulations — your <strong style="color:#c8a84b;">${tier || 'BASIC'}</strong> membership at Trillion Business Community has been <strong style="color:#c8a84b;">approved</strong>.
    </div>
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;padding-top:12px;">
      Your wallet is now active and you have full access to the member portal, community, and deal room.
    </div>
    <div style="text-align:center;padding-top:22px;">
      ${goldButton(loginUrl, 'Sign in to your account')}
    </div>`;
  return shell({
    title: 'Your membership is approved',
    intro: 'Welcome to Trillion Business Community — your account is now active.',
    bodyHtml: body,
    footerNote: 'Need help getting started? Reply to this email and our team will be in touch.',
  });
}

async function sendAccountApprovedEmail(user, tier) {
  const loginUrl = `${process.env.FRONTEND_URL || 'https://trillionbusinesscommunity.com'}/login`;
  return sendMail({
    to: user.email,
    subject: 'Your TBC membership has been approved',
    text: `Hi ${user.name || ''}, your ${tier || 'BASIC'} membership at Trillion Business Community has been approved. Sign in at ${loginUrl}`,
    html: accountApprovedHtml({ name: user.name, tier, loginUrl }),
  });
}

// ── Rejection (to the user) ────────────────────
function accountRejectedHtml({ name, reason }) {
  const reasonBlock = reason
    ? `<div style="margin-top:14px;padding:14px 16px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:13px;color:#c9cddb;">
         <div style="color:#7a819a;font-size:11px;letter-spacing:1px;padding-bottom:6px;">REASON</div>
         ${reason}
       </div>`
    : '';
  const body = `
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;">
      Hi ${name || 'there'}, thank you for your interest in Trillion Business Community. After reviewing your application, we're unable to approve it at this time.
    </div>
    ${reasonBlock}
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;padding-top:12px;">
      If you believe this was in error or would like to provide additional information, please reply to this email.
    </div>`;
  return shell({
    title: 'Application update',
    intro: 'Your membership application status has been updated.',
    bodyHtml: body,
    footerNote: 'This decision was made by our membership review team.',
  });
}

async function sendAccountRejectedEmail(user, reason) {
  return sendMail({
    to: user.email,
    subject: 'Your TBC membership application',
    text: `Hi ${user.name || ''}, after reviewing your application to Trillion Business Community, we are unable to approve it at this time.${reason ? `\n\nReason: ${reason}` : ''}`,
    html: accountRejectedHtml({ name: user.name, reason }),
  });
}

// ── Admin notification (new signup) ────────────
function adminNewSignupHtml({ user, adminUrl }) {
  const details = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${detailRow('Name',         user.name || '—')}
      ${detailRow('Email',        user.email)}
      ${detailRow('Account type', user.accountType || '—')}
      ${detailRow('Signup via',   user.signupMethod || 'email')}
      ${detailRow('Received',     new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC')}
    </table>`;
  const body = `
    ${details}
    <div style="text-align:center;padding-top:24px;">
      ${goldButton(adminUrl, 'Open admin portal')}
    </div>`;
  return shell({
    title: 'New membership application',
    intro: 'A new user has submitted a membership application and is awaiting your review.',
    bodyHtml: body,
    footerNote: 'You are receiving this because you are set as ADMIN_NOTIFY_EMAIL.',
  });
}

async function sendAdminNewSignupNotification(user) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  const adminUrl = `${process.env.FRONTEND_URL || 'https://trillionbusinesscommunity.com'}/admin`;
  return sendMail({
    to,
    subject: `New TBC application: ${user.name || user.email}`,
    text: `New membership application received.\n\nName: ${user.name || '—'}\nEmail: ${user.email}\nAccount type: ${user.accountType || '—'}\nSignup via: ${user.signupMethod || 'email'}\n\nOpen admin portal: ${adminUrl}`,
    html: adminNewSignupHtml({ user, adminUrl }),
  });
}

module.exports = {
  sendMail,
  sendOtpEmail,
  sendWelcomePendingEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendAdminNewSignupNotification,
};
