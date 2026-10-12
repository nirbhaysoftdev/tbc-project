// src/services/mailer.js
// SMTP transport for portal@trillionbusinesscommunity.com
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { logActivity } = require('./activityLog');

let cachedTransport = null;

// ── Company identity (appears on invoices and statements) ─────────────────────
// Legal name and address are confirmed by the business. The registration
// number is still outstanding. Each value can be overridden from .env without
// touching this file.
const COMPANY = {
  legalName: process.env.COMPANY_LEGAL_NAME || 'TBC GLOBAL MANAGEMENT LLC',
  address:   process.env.COMPANY_ADDRESS    || 'Sharjah Media City, Sharjah, UAE',
  regNumber: process.env.COMPANY_REG_NUMBER || '',
  vatNumber: process.env.COMPANY_VAT_NUMBER || '',
  vatNote:   process.env.COMPANY_VAT_NOTE   || '',
  email:     process.env.SMTP_FROM_EMAIL    || 'portal@trillionbusinesscommunity.com',
  website:   process.env.COMPANY_WEBSITE    || 'trillionbusinesscommunity.com',
};

// ── Brand logo ────────────────────────────────────────────────────────────────
// Embedded by Content-ID rather than linked, so it renders even where a client
// blocks remote images. Falls back to the wordmark when the asset is missing,
// so a missing file can never stop an email going out.
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'tbc-logo.png');
const LOGO_CID = 'tbc-logo';

let logoExists = null;
function hasLogo() {
  if (logoExists === null) {
    try {
      logoExists = fs.existsSync(LOGO_PATH);
      if (!logoExists) console.warn(`mailer: logo not found at ${LOGO_PATH}, falling back to wordmark`);
    } catch {
      logoExists = false;
    }
  }
  return logoExists;
}

function logoAttachment() {
  return hasLogo()
    ? [{ filename: 'tbc-logo.png', path: LOGO_PATH, cid: LOGO_CID, contentDisposition: 'inline' }]
    : [];
}

const eur = (n) => `€ ${Number(n || 0).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const longDate = (d) => new Date(d || Date.now()).toLocaleDateString('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric',
});

/**
 * Document reference derived from the record it belongs to: unique without a
 * counter, and stable if the same email is ever resent.
 */
function documentNumber(prefix, recordId, date) {
  const year = new Date(date || Date.now()).getFullYear();
  const suffix = String(recordId || '').replace(/-/g, '').slice(0, 6).toUpperCase();
  return `TBC-${prefix}-${year}-${suffix || 'PENDING'}`;
}

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
    // The full SMTP conversation includes recipient addresses - keep it out of
    // production logs.
    logger: process.env.NODE_ENV !== 'production',
    debug: process.env.NODE_ENV !== 'production',
  });
  return cachedTransport;
}

// Every outbound email funnels through here, so this is also where the
// activity feed records it - both the sends and the failures.
async function sendMail({ to, subject, html, text, attachments = [] }) {
  const from = `"${process.env.SMTP_FROM_NAME || 'TBC'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;
  const recipients = Array.isArray(to) ? to.join(', ') : to;
  try {
    const info = await getTransport().sendMail({
      from, to, subject, html, text,
      attachments: [...logoAttachment(), ...attachments],
    });
    logActivity({
      type:        'EMAIL_SENT',
      title:       subject || '(no subject)',
      description: `To ${recipients}`,
      metadata:    { to: recipients, subject, messageId: info?.messageId || null,
                     attachments: attachments.length },
    });
    return info;
  } catch (err) {
    logActivity({
      type:        'EMAIL_FAILED',
      status:      'FAILED',
      title:       subject || '(no subject)',
      description: `To ${recipients} - ${err.message}`,
      metadata:    { to: recipients, subject, error: err.message },
    });
    throw err;
  }
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
                  ${hasLogo()
                    ? `<img src="cid:${LOGO_CID}" width="84" height="84" alt="Trillion Business Community"
                         style="display:block;width:84px;height:84px;border:0;outline:none;margin:0 auto 12px;" />`
                    : ''}
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
      Your membership is now in <strong style="color:#c8a84b;">pending review</strong>. Our team will verify your details and notify you by email as soon as your membership is approved. You won't have full portal access until then.
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
    text: `Hi ${user.name || ''}, thank you for applying to join Trillion Business Community. Your membership is pending admin review - we will email you as soon as it is approved.`,
    html: welcomePendingHtml({ name: user.name }),
  });
}

// ── Approval (to the user) ─────────────────────
function accountApprovedHtml({ name, loginUrl, walletEnabled = true }) {
  const walletLine = walletEnabled
    ? 'Your wallet is now active and you have full access to the member portal, community, and deal room.'
    : 'You now have access to the member portal and community. Your wallet has not been enabled yet - your account manager can activate it when ready.';
  const body = `
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;">
      Hi ${name || 'there'}, congratulations - your membership at Trillion Business Community has been <strong style="color:#c8a84b;">approved</strong>.
    </div>
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;padding-top:12px;">
      Your membership has been approved. You can now log in using your registered email and password.
    </div>
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;padding-top:12px;">
      ${walletLine}
    </div>
    <div style="text-align:center;padding-top:22px;">
      ${goldButton(loginUrl, 'Sign in to your membership')}
    </div>`;
  return shell({
    title: 'Your membership has been activated',
    intro: 'Welcome to Trillion Business Community - your membership is now active.',
    bodyHtml: body,
    footerNote: 'Need help getting started? Reply to this email and our team will be in touch.',
  });
}

async function sendAccountApprovedEmail(user, walletEnabled = true) {
  const loginUrl = `${process.env.FRONTEND_URL || 'https://trillionbusinesscommunity.com'}/login`;
  return sendMail({
    to: user.email,
    subject: 'Your Community Membership Has Been Activated',
    text: `Hi ${user.name || ''}, your membership at Trillion Business Community has been approved. You can now log in using your registered email and password. ${walletEnabled ? 'Your wallet is now active.' : 'Your wallet has not been enabled yet.'} Sign in at ${loginUrl}`,
    html: accountApprovedHtml({ name: user.name, loginUrl, walletEnabled }),
  });
}

// ── New member welcome (admin-created, to the member) ──
function memberWelcomeHtml({ name, email, tempPassword, loginUrl, walletEnabled }) {
  const details = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${detailRow('Login email', email)}
      ${detailRow('Temporary password', `<span style="font-family:'Courier New',monospace;letter-spacing:1px;color:#c8a84b;font-weight:700;">${tempPassword}</span>`)}
      ${detailRow('Wallet', walletEnabled ? 'Enabled' : 'Not enabled yet')}
    </table>`;
  const body = `
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;">
      Hi ${name || 'there'}, congratulations - you have successfully joined <strong style="color:#c8a84b;">Trillion Business Community</strong>!
    </div>
    <div style="padding-top:16px;">${details}</div>
    <div style="text-align:center;padding-top:22px;">
      ${goldButton(loginUrl, 'Sign in to your membership')}
    </div>
    <div style="font-size:13px;line-height:1.6;color:#7a819a;padding-top:20px;">
      For your security, please sign in and change your password from <strong style="color:#c8a84b;">Settings</strong> as soon as possible.
    </div>`;
  return shell({
    title: 'Welcome to the community',
    intro: 'Your membership has been created by our team.',
    bodyHtml: body,
    footerNote: "If you weren't expecting this email, please contact our team.",
  });
}

async function sendMemberWelcomeEmail(user, tempPassword, walletEnabled) {
  const loginUrl = `${process.env.FRONTEND_URL || 'https://trillionbusinesscommunity.com'}/login`;
  return sendMail({
    to: user.email,
    subject: 'Congratulations! Welcome to the Community',
    text: `Hi ${user.name || ''}, congratulations - you have successfully joined Trillion Business Community.\n\nLogin email: ${user.email}\nTemporary password: ${tempPassword}\nWallet: ${walletEnabled ? 'Enabled' : 'Not enabled yet'}\n\nSign in at ${loginUrl} and change your password from Settings after your first login.`,
    html: memberWelcomeHtml({ name: user.name, email: user.email, tempPassword, loginUrl, walletEnabled }),
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

// ── Financial documents (invoice / statements) ────────────────────────────────
// Shared chrome for anything that functions as a record the member may keep,
// forward to an accountant or print: a document header with its reference and
// date, a line-item table, a total, and the issuing company block.

function documentShell({ docLabel, docNumber, issuedOn, billTo, partyLabel = 'BILLED TO', rows, totalLabel, totalValue, note }) {
  const party = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td width="50%" valign="top" style="font-size:12px;color:#7a819a;line-height:1.6;">
          <div style="font-size:10px;letter-spacing:1.5px;color:#5c6479;padding-bottom:6px;">FROM</div>
          <div style="color:#e6e8ee;font-weight:600;">${COMPANY.legalName}</div>
          <div>${COMPANY.address}</div>
          ${COMPANY.regNumber ? `<div>Reg. no: ${COMPANY.regNumber}</div>` : ''}
          ${COMPANY.vatNumber ? `<div>VAT no: ${COMPANY.vatNumber}</div>` : ''}
        </td>
        <td width="50%" valign="top" style="font-size:12px;color:#7a819a;line-height:1.6;">
          <div style="font-size:10px;letter-spacing:1.5px;color:#5c6479;padding-bottom:6px;">${partyLabel}</div>
          <div style="color:#e6e8ee;font-weight:600;">${billTo.name || '-'}</div>
          <div>${billTo.email || ''}</div>
          ${billTo.address ? `<div>${billTo.address}</div>` : ''}
          ${billTo.vatNumber ? `<div>VAT no: ${billTo.vatNumber}</div>` : ''}
        </td>
      </tr>
    </table>`;

  const lineItems = rows.map(({ label, value, muted }) => `
    <tr>
      <td style="padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);font-size:13px;color:${muted ? '#7a819a' : '#c9cddb'};">${label}</td>
      <td align="right" style="padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);font-size:13px;color:${muted ? '#7a819a' : '#e6e8ee'};font-weight:${muted ? '400' : '600'};">${value}</td>
    </tr>`).join('');

  return `
    <div style="padding:16px 18px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="font-size:11px;letter-spacing:2px;color:#c8a84b;font-weight:700;">${docLabel}</td>
          <td align="right" style="font-size:12px;color:#7a819a;">${longDate(issuedOn)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-family:'Courier New',monospace;font-size:14px;color:#e6e8ee;padding-top:4px;">${docNumber}</td>
        </tr>
      </table>
      <div style="padding:18px 0 4px;">${party}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px;">
        ${lineItems}
        <tr>
          <td style="padding:14px 12px;border-top:1px solid rgba(200,168,75,0.35);font-size:13px;color:#c8a84b;font-weight:700;letter-spacing:0.5px;">${totalLabel}</td>
          <td align="right" style="padding:14px 12px;border-top:1px solid rgba(200,168,75,0.35);font-size:18px;color:#c8a84b;font-weight:700;">${totalValue}</td>
        </tr>
      </table>
      ${note ? `<div style="font-size:11px;color:#5c6479;line-height:1.6;padding-top:12px;">${note}</div>` : ''}
    </div>`;
}

const projectLine = (projectTitle) => projectTitle || 'General investment (no project)';

function billToFrom(user) {
  const p = user.profile || {};
  return {
    name: user.name,
    email: user.email,
    address: p.billingAddress || p.businessAddress || [p.city, p.country].filter(Boolean).join(', '),
    vatNumber: p.vatNumber || '',
  };
}

// ── Investment invoice ─────────────────────────
function investmentInvoiceHtml({ user, amount, projectTitle, investedAt, docNumber, reference }) {
  const rows = [
    { label: 'Description', value: 'Capital investment' },
    { label: 'Project', value: projectLine(projectTitle) },
    { label: 'Investment date', value: longDate(investedAt) },
  ];
  if (reference) rows.push({ label: 'Reference', value: reference, muted: true });
  rows.push({ label: 'Amount received', value: eur(amount) });

  const body = `
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;padding-bottom:18px;">
      Hi ${user.name || 'there'}, we confirm receipt of your investment. Your capital has been recorded
      against ${projectTitle ? `<strong style="color:#c8a84b;">${projectTitle}</strong>` : 'your membership'}
      and is now visible in your member portal.
    </div>
    ${documentShell({
      docLabel: 'INVESTMENT INVOICE',
      docNumber,
      issuedOn: investedAt,
      billTo: billToFrom(user),
      rows,
      totalLabel: 'TOTAL INVESTED',
      totalValue: eur(amount),
      note: COMPANY.vatNote || 'Invested capital remains your principal and is not withdrawable as profit.',
    })}
    <div style="text-align:center;padding-top:22px;">
      ${goldButton(`${process.env.FRONTEND_URL || 'https://trillionbusinesscommunity.com'}/dashboard`, 'View in your portal')}
    </div>`;

  return shell({
    title: 'Investment confirmed',
    intro: 'This is your official confirmation and invoice for the investment recorded below.',
    bodyHtml: body,
    footerNote: `Issued by ${COMPANY.legalName}. Please retain this document for your records.`,
  });
}

async function sendInvestmentInvoiceEmail({ user, amount, projectTitle, investedAt, investmentId, reference }) {
  const docNumber = documentNumber('INV', investmentId, investedAt);
  return sendMail({
    to: user.email,
    subject: `Investment confirmation ${docNumber} - ${eur(amount)}`,
    text: `Hi ${user.name || ''}, we confirm receipt of your investment of ${eur(amount)}.\n\n`
        + `Invoice: ${docNumber}\nProject: ${projectLine(projectTitle)}\nInvestment date: ${longDate(investedAt)}\n\n`
        + `Issued by ${COMPANY.legalName}. Please retain this for your records.`,
    html: investmentInvoiceHtml({ user, amount, projectTitle, investedAt, docNumber, reference }),
  });
}

// ── Profit statement ───────────────────────────
function profitStatementHtml({ user, amount, projectTitle, rate, capitalBase, period, generatedAt, docNumber, isMonthly }) {
  const rows = [
    { label: 'Description', value: isMonthly ? 'Monthly profit distribution' : 'One-time profit distribution' },
    { label: 'Project', value: projectLine(projectTitle) },
  ];
  if (rate != null) rows.push({ label: 'Profit rate', value: `${rate}%`, muted: true });
  if (capitalBase != null) rows.push({ label: 'Calculated on capital', value: eur(capitalBase), muted: true });
  if (isMonthly && period) rows.push({ label: 'Period', value: period, muted: true });
  rows.push({ label: 'Amount', value: eur(amount) });

  const body = `
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;padding-bottom:18px;">
      Hi ${user.name || 'there'}, profit has been credited to your membership
      ${projectTitle ? `from <strong style="color:#c8a84b;">${projectTitle}</strong>` : ''}.
      It has been added to your available profit and can be withdrawn.
    </div>
    ${documentShell({
      docLabel: 'PROFIT STATEMENT',
      docNumber,
      issuedOn: generatedAt,
      billTo: billToFrom(user),
      partyLabel: 'CREDITED TO',
      rows,
      totalLabel: 'TOTAL CREDITED',
      totalValue: eur(amount),
      note: 'Profit is calculated on your invested capital only and is never added to that capital.',
    })}
    <div style="text-align:center;padding-top:22px;">
      ${goldButton(`${process.env.FRONTEND_URL || 'https://trillionbusinesscommunity.com'}/dashboard`, 'View in your portal')}
    </div>`;

  return shell({
    title: 'Profit credited',
    intro: 'A profit distribution has been added to your membership.',
    bodyHtml: body,
    footerNote: `Issued by ${COMPANY.legalName}. Please retain this document for your records.`,
  });
}

async function sendProfitStatementEmail({ user, amount, projectTitle, rate, capitalBase, period, generatedAt, profitRecordId, isMonthly }) {
  const docNumber = documentNumber('PRF', profitRecordId, generatedAt);
  return sendMail({
    to: user.email,
    subject: `Profit credited ${docNumber} - ${eur(amount)}`,
    text: `Hi ${user.name || ''}, profit of ${eur(amount)} has been credited to your membership.\n\n`
        + `Statement: ${docNumber}\nProject: ${projectLine(projectTitle)}\n`
        + `${rate != null ? `Rate: ${rate}%\n` : ''}${capitalBase != null ? `Calculated on capital: ${eur(capitalBase)}\n` : ''}`
        + `\nIssued by ${COMPANY.legalName}.`,
    html: profitStatementHtml({ user, amount, projectTitle, rate, capitalBase, period, generatedAt, docNumber, isMonthly }),
  });
}

// ── Withdrawal confirmation ────────────────────
const maskIban = (iban) => {
  const v = String(iban || '').replace(/\s/g, '');
  return v.length > 4 ? `${'•'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : v;
};

function withdrawalConfirmationHtml({ user, amount, bankName, iban, approvedAt, docNumber, availableProfit }) {
  const rows = [
    { label: 'Description', value: 'Profit withdrawal' },
    { label: 'Bank', value: bankName || '-', muted: true },
    { label: 'Account', value: maskIban(iban), muted: true },
    { label: 'Approved on', value: longDate(approvedAt), muted: true },
    { label: 'Amount', value: eur(amount) },
  ];

  const body = `
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;padding-bottom:18px;">
      Hi ${user.name || 'there'}, your withdrawal request has been approved and is being processed
      to the account below. Your invested capital is unaffected.
    </div>
    ${documentShell({
      docLabel: 'WITHDRAWAL CONFIRMATION',
      docNumber,
      issuedOn: approvedAt,
      billTo: billToFrom(user),
      partyLabel: 'PAID TO',
      rows,
      totalLabel: 'AMOUNT WITHDRAWN',
      totalValue: eur(amount),
      note: availableProfit != null
        ? `Remaining available profit after this withdrawal: ${eur(availableProfit)}.`
        : null,
    })}`;

  return shell({
    title: 'Withdrawal approved',
    intro: 'Your withdrawal has been approved and is on its way to your bank.',
    bodyHtml: body,
    footerNote: `Issued by ${COMPANY.legalName}. Bank transfers may take several working days to arrive.`,
  });
}

async function sendWithdrawalConfirmationEmail({ user, amount, bankName, iban, approvedAt, requestId, availableProfit }) {
  const docNumber = documentNumber('WDR', requestId, approvedAt);
  return sendMail({
    to: user.email,
    subject: `Withdrawal approved ${docNumber} - ${eur(amount)}`,
    text: `Hi ${user.name || ''}, your withdrawal of ${eur(amount)} has been approved and is being processed.\n\n`
        + `Reference: ${docNumber}\nBank: ${bankName || '-'}\nAccount: ${maskIban(iban)}\n\n`
        + `Issued by ${COMPANY.legalName}.`,
    html: withdrawalConfirmationHtml({ user, amount, bankName, iban, approvedAt, docNumber, availableProfit }),
  });
}

// ── Admin notification (new signup) ────────────
function adminNewSignupHtml({ user, adminUrl }) {
  const details = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${detailRow('Name',         user.name || '-')}
      ${detailRow('Email',        user.email)}
      ${detailRow('Membership type', user.accountType || '-')}
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
    text: `New membership application received.\n\nName: ${user.name || '-'}\nEmail: ${user.email}\nMembership type: ${user.accountType || '-'}\nSignup via: ${user.signupMethod || 'email'}\n\nOpen admin portal: ${adminUrl}`,
    html: adminNewSignupHtml({ user, adminUrl }),
  });
}

// ── Wallet activated (admin enabled a member's wallet) ───────────────────────
//
// Sent the moment a member's wallet goes live, so they learn the opening
// balance from us rather than discovering it on the dashboard. The figures are
// the derived breakdown, not the raw opening-balance columns, so a member who
// already had project capital sees their real total.
function walletActivatedHtml({ name, breakdown, loginUrl }) {
  const rows = [
    { label: 'Opening capital', value: eur(breakdown.openingCapital) },
    { label: 'Opening profit', value: eur(breakdown.openingProfit) },
  ];
  if (breakdown.projectCapital > 0) rows.push({ label: 'Capital from projects', value: eur(breakdown.projectCapital) });
  if (breakdown.projectProfit > 0) rows.push({ label: 'Profit from projects', value: eur(breakdown.projectProfit) });

  const lines = rows.map(({ label, value }) => `
    <tr>
      <td style="padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);font-size:13px;color:#c9cddb;">${label}</td>
      <td align="right" style="padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);font-size:13px;color:#e6e8ee;font-weight:600;">${value}</td>
    </tr>`).join('');

  const statement = `
    <div style="padding:16px 18px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
      <div style="font-size:11px;letter-spacing:2px;color:#c8a84b;font-weight:700;">OPENING POSITION</div>
      <div style="font-size:12px;color:#7a819a;padding-top:4px;">As at ${longDate(Date.now())}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
        ${lines}
        <tr>
          <td style="padding:14px 12px;border-top:1px solid rgba(200,168,75,0.35);font-size:13px;color:#c8a84b;font-weight:700;letter-spacing:0.5px;">TOTAL BALANCE</td>
          <td align="right" style="padding:14px 12px;border-top:1px solid rgba(200,168,75,0.35);font-size:18px;color:#c8a84b;font-weight:700;">${eur(breakdown.totalBalance)}</td>
        </tr>
      </table>
    </div>`;

  const body = `
    <div style="font-size:14px;line-height:1.6;color:#aab0c0;">
      Hi ${name || 'there'}, your TBC wallet is now <strong style="color:#c8a84b;">active</strong>.
      Here is the balance it has been activated with.
    </div>
    <div style="padding-top:18px;">${statement}</div>
    <div style="text-align:center;padding-top:22px;">
      ${goldButton(loginUrl, 'View your wallet')}
    </div>
    <div style="font-size:13px;line-height:1.6;color:#7a819a;padding-top:20px;">
      Invested capital is not withdrawable - only available profit is. You can follow every movement
      on your balance from the dashboard at any time.
    </div>`;

  return shell({
    title: 'Your wallet is now active',
    intro: 'Your account manager has enabled your TBC wallet.',
    bodyHtml: body,
    footerNote: `Questions about these figures? Reply to this email or write to ${COMPANY.email}.`,
  });
}

async function sendWalletActivatedEmail({ user, breakdown }) {
  const loginUrl = `${process.env.FRONTEND_URL || 'https://trillionbusinesscommunity.com'}/dashboard`;
  return sendMail({
    to: user.email,
    subject: `Your TBC wallet is active - ${eur(breakdown.totalBalance)}`,
    text: `Hi ${user.name || ''}, your TBC wallet is now active.\n\n`
      + `Opening capital: ${eur(breakdown.openingCapital)}\n`
      + `Opening profit:  ${eur(breakdown.openingProfit)}\n`
      + (breakdown.projectCapital > 0 ? `Capital from projects: ${eur(breakdown.projectCapital)}\n` : '')
      + (breakdown.projectProfit > 0 ? `Profit from projects:  ${eur(breakdown.projectProfit)}\n` : '')
      + `Total balance:   ${eur(breakdown.totalBalance)}\n\n`
      + `View your wallet at ${loginUrl}`,
    html: walletActivatedHtml({ name: user.name, breakdown, loginUrl }),
  });
}

// ── Member statement (full portfolio, sent from the admin detail page) ────────
//
// The admin presses "Email Now" on a member's detail page and the member
// receives what the admin is looking at. Everything is rendered as tables and
// table-cell bars: an email client will not run a canvas or an SVG chart, so
// the "charts" here are proportional bars built out of nested tables, which
// render identically everywhere including Outlook.

const monthLabel = (key) => {
  const [y, m] = String(key).split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
};

/** Summary tiles, two per row, so they stack cleanly on a phone. */
function statGrid(tiles) {
  const cell = ({ label, value, accent }) => `
    <td width="50%" valign="top" style="padding:6px;">
      <div style="padding:14px 16px;border-radius:12px;background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.07);">
        <div style="font-size:10px;letter-spacing:1.5px;color:#5c6479;padding-bottom:6px;">${label}</div>
        <div style="font-size:19px;font-weight:700;color:${accent || '#e6e8ee'};">${value}</div>
      </div>
    </td>`;

  const rows = [];
  for (let i = 0; i < tiles.length; i += 2) {
    rows.push(`<tr>${cell(tiles[i])}${tiles[i + 1] ? cell(tiles[i + 1]) : '<td width="50%"></td>'}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.join('')}</table>`;
}

/** A data table. `align` marks which columns are numeric and right-aligned. */
function dataTable({ title, head, rows, align = [], empty = 'Nothing recorded yet.' }) {
  const body = rows.length
    ? rows.map((cells) => `
      <tr>${cells.map((c, i) => `
        <td align="${align[i] ? 'right' : 'left'}" style="padding:9px 10px;border-top:1px solid rgba(255,255,255,0.06);font-size:12px;color:${i === 0 ? '#e6e8ee' : '#aab0c0'};">${c}</td>`).join('')}
      </tr>`).join('')
    : `<tr><td colspan="${head.length}" style="padding:14px 10px;border-top:1px solid rgba(255,255,255,0.06);font-size:12px;color:#5c6479;">${empty}</td></tr>`;

  return `
    <div style="padding-top:26px;">
      <div style="font-size:11px;letter-spacing:2px;color:#c8a84b;font-weight:700;padding-bottom:10px;">${title}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:12px;background:rgba(255,255,255,0.03);">
        <tr>${head.map((h, i) => `
          <th align="${align[i] ? 'right' : 'left'}" style="padding:9px 10px;font-size:10px;letter-spacing:1px;color:#5c6479;font-weight:600;text-transform:uppercase;">${h}</th>`).join('')}
        </tr>
        ${body}
      </table>
    </div>`;
}

/** Proportional bar "chart" — one row per month, width as a percentage of the peak. */
function barChart({ title, points, caption }) {
  if (!points.length) return '';
  const peak = Math.max(...points.map((p) => p.value), 0);
  const rows = points.map((p) => {
    const pct = peak > 0 ? Math.max(2, Math.round((p.value / peak) * 100)) : 2;
    return `
      <tr>
        <td width="64" style="padding:4px 8px 4px 0;font-size:11px;color:#7a819a;white-space:nowrap;">${p.label}</td>
        <td style="padding:4px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td width="${pct}%" style="height:12px;border-radius:6px;background:${p.color || '#c8a84b'};"></td>
              <td width="${100 - pct}%"></td>
            </tr>
          </table>
        </td>
        <td width="92" align="right" style="padding:4px 0 4px 8px;font-size:11px;color:#c9cddb;white-space:nowrap;">${eur(p.value)}</td>
      </tr>`;
  }).join('');

  return `
    <div style="padding-top:26px;">
      <div style="font-size:11px;letter-spacing:2px;color:#c8a84b;font-weight:700;padding-bottom:10px;">${title}</div>
      <div style="padding:14px 16px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
        ${caption ? `<div style="font-size:11px;color:#5c6479;padding-top:10px;">${caption}</div>` : ''}
      </div>
    </div>`;
}

function memberStatementHtml({ overview, docNumber, note }) {
  const { member, breakdown, byProject, investments, profitRecords, transactions, withdrawRequests, profitConfigs, kpis, series } = overview;

  const tiles = statGrid([
    { label: 'INVESTED CAPITAL',   value: eur(kpis.investedCapital) },
    { label: 'TOTAL BALANCE',      value: eur(kpis.totalBalance), accent: '#c8a84b' },
    { label: 'PROFIT EARNED',      value: eur(kpis.grossProfit), accent: '#4cd98a' },
    { label: 'AVAILABLE PROFIT',   value: eur(kpis.availableProfit), accent: '#4cd98a' },
    { label: 'WITHDRAWN',          value: eur(kpis.withdrawnProfit) },
    { label: 'RETURN ON CAPITAL',  value: `${kpis.roi}%` },
  ]);

  // The last 12 cycles keep the email short while still showing a trend.
  const recentSeries = series.slice(-12);

  const balanceChart = barChart({
    title: 'BALANCE OVER TIME',
    points: recentSeries.map((p) => ({ label: monthLabel(p.month), value: p.balance, color: '#5090ff' })),
    caption: 'Invested capital plus available profit at the end of each month.',
  });

  const profitChart = barChart({
    title: 'PROFIT PER MONTH',
    points: recentSeries.map((p) => ({ label: monthLabel(p.month), value: p.profitEarned, color: '#4cd98a' })),
    caption: 'Profit credited in each monthly cycle.',
  });

  // The opening balance predates the project ledger and has no project behind
  // it, so it is shown as its own row rather than being silently left out of a
  // table whose total would then not match the summary above.
  const projectRows = byProject.map((p) => [p.projectTitle, eur(p.capital), eur(p.profit)]);
  if (breakdown.openingCapital > 0 || breakdown.openingProfit > 0) {
    projectRows.push(['Opening balance', eur(breakdown.openingCapital), eur(breakdown.openingProfit)]);
  }
  const projectTable = dataTable({
    title: 'BY PROJECT',
    head: ['Project', 'Capital', 'Profit'],
    align: [false, true, true],
    rows: projectRows,
    empty: 'No capital booked against a project yet.',
  });

  const investmentTable = dataTable({
    title: 'INVESTMENTS',
    head: ['Project', 'Date', 'Amount', 'Outstanding', 'Status'],
    align: [false, false, true, true, false],
    rows: investments.map((i) => [
      projectLine(i.project?.title),
      longDate(i.investedAt),
      eur(i.amount),
      eur(Math.max(0, i.amount - (i.returnedAmount || 0))),
      i.status,
    ]),
  });

  const profitTable = dataTable({
    title: 'PROFIT RECORDS',
    head: ['Project', 'Period', 'Rate', 'Capital base', 'Profit'],
    align: [false, false, true, true, true],
    rows: profitRecords.slice(0, 24).map((r) => [
      projectLine(r.project?.title),
      // A one-time period is an internal uniqueness token, not something to
      // show a member; the date it was credited is what they recognise.
      r.period.startsWith('ONE_TIME') ? `One-time · ${longDate(r.generatedAt)}` : r.period,
      r.rate != null ? `${r.rate}%` : '—',
      eur(r.capitalSnapshot),
      eur(r.amount),
    ]),
  });

  const rateTable = dataTable({
    title: 'MONTHLY PROFIT RATES IN FORCE',
    head: ['Project', 'Rate', 'Cycle day', 'Effective from'],
    align: [false, true, true, false],
    rows: profitConfigs.map((c) => [
      projectLine(c.project?.title),
      `${c.rate}%`,
      String(c.monthlyProfitDay),
      longDate(c.effectiveFrom),
    ]),
    empty: 'No monthly profit rate configured.',
  });

  const txTable = dataTable({
    title: 'RECENT TRANSACTIONS',
    head: ['Date', 'Description', 'Category', 'Amount'],
    align: [false, false, false, true],
    rows: transactions.slice(0, 25).map((t) => [
      longDate(t.createdAt),
      t.description || '—',
      t.category || '—',
      `${t.type === 'DEBIT' ? '-' : '+'} ${eur(t.amount)}`,
    ]),
  });

  const withdrawTable = dataTable({
    title: 'WITHDRAWAL REQUESTS',
    head: ['Date', 'Bank', 'Amount', 'Status'],
    align: [false, false, true, false],
    rows: withdrawRequests.map((w) => [
      longDate(w.createdAt),
      w.bankName || '—',
      eur(w.amount),
      w.status,
    ]),
    empty: 'No withdrawal requests.',
  });

  const header = `
    <div style="padding:16px 18px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="font-size:11px;letter-spacing:2px;color:#c8a84b;font-weight:700;">PORTFOLIO STATEMENT</td>
          <td align="right" style="font-size:12px;color:#7a819a;">${longDate(overview.generatedAt)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-family:'Courier New',monospace;font-size:14px;color:#e6e8ee;padding-top:4px;">${docNumber}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;padding-top:14px;">
        <tr>
          <td width="50%" valign="top" style="font-size:12px;color:#7a819a;line-height:1.6;padding-top:16px;">
            <div style="font-size:10px;letter-spacing:1.5px;color:#5c6479;padding-bottom:6px;">FROM</div>
            <div style="color:#e6e8ee;font-weight:600;">${COMPANY.legalName}</div>
            <div>${COMPANY.address}</div>
          </td>
          <td width="50%" valign="top" style="font-size:12px;color:#7a819a;line-height:1.6;padding-top:16px;">
            <div style="font-size:10px;letter-spacing:1.5px;color:#5c6479;padding-bottom:6px;">MEMBER</div>
            <div style="color:#e6e8ee;font-weight:600;">${member.name || '-'}</div>
            <div>${member.email}</div>
            <div>Member since ${longDate(kpis.joinedAt)}</div>
            <div>${member.status}</div>
          </td>
        </tr>
      </table>
    </div>`;

  const body = `
    ${header}
    ${note ? `<div style="font-size:13px;line-height:1.6;color:#c9cddb;padding:20px 0 0;">${String(note).replace(/</g, '&lt;')}</div>` : ''}
    <div style="padding-top:20px;">${tiles}</div>
    ${balanceChart}
    ${profitChart}
    ${projectTable}
    ${investmentTable}
    ${profitTable}
    ${rateTable}
    ${txTable}
    ${withdrawTable}`;

  return shell({
    title: 'Your portfolio statement',
    intro: `Hi ${member.name || 'there'}, here is the complete picture of your capital, profit and membership
            activity with Trillion Business Community as at ${longDate(overview.generatedAt)}.`,
    bodyHtml: body,
    footerNote: `Invested capital is not withdrawable — only available profit is.
                 Questions about this statement? Reply to this email or write to ${COMPANY.email}.`,
  });
}

function memberStatementText({ overview }) {
  const { member, kpis, byProject } = overview;
  const lines = [
    `Portfolio statement - ${member.name || member.email}`,
    `As at ${longDate(overview.generatedAt)}`,
    '',
    `Invested capital:  ${eur(kpis.investedCapital)}`,
    `Profit earned:     ${eur(kpis.grossProfit)}`,
    `Available profit:  ${eur(kpis.availableProfit)}`,
    `Withdrawn:         ${eur(kpis.withdrawnProfit)}`,
    `Total balance:     ${eur(kpis.totalBalance)}`,
    `Return on capital: ${kpis.roi}%`,
    '',
    'By project:',
    ...byProject.map((p) => `  - ${p.projectTitle}: capital ${eur(p.capital)}, profit ${eur(p.profit)}`),
    ...(overview.breakdown.openingCapital > 0 || overview.breakdown.openingProfit > 0
      ? [`  - Opening balance: capital ${eur(overview.breakdown.openingCapital)}, profit ${eur(overview.breakdown.openingProfit)}`]
      : []),
    '',
    `${COMPANY.legalName} · ${COMPANY.address}`,
  ];
  return lines.join('\n');
}

async function sendMemberStatementEmail({ overview, note }) {
  const { member } = overview;
  const docNumber = documentNumber('STM', member.id, overview.generatedAt);
  return sendMail({
    to: member.email,
    subject: `Your TBC portfolio statement — ${longDate(overview.generatedAt)}`,
    text: memberStatementText({ overview }),
    html: memberStatementHtml({ overview, docNumber, note }),
  });
}

module.exports = {
  sendMail,
  sendOtpEmail,
  sendWelcomePendingEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendAdminNewSignupNotification,
  sendMemberWelcomeEmail,
  sendInvestmentInvoiceEmail,
  sendProfitStatementEmail,
  sendWithdrawalConfirmationEmail,
  sendMemberStatementEmail,
  sendWalletActivatedEmail,
  documentNumber,
  COMPANY,
};
