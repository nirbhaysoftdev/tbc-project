// src/services/otpService.js
// Generate, store, and verify 6-digit email OTPs.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../utils/prismaClient');
const { sendOtpEmail } = require('./mailer');

const CODE_LENGTH = 6;
const EXPIRES_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function generateCode() {
  // 6-digit numeric, zero-padded
  const n = crypto.randomInt(0, 10 ** CODE_LENGTH);
  return String(n).padStart(CODE_LENGTH, '0');
}

async function issueOtp(email, purpose = 'SIGNUP') {
  const normalized = String(email).toLowerCase().trim();

  // Rate-limit resends: reject if a fresh, unconsumed OTP was created recently.
  const recent = await prisma.emailOtp.findFirst({
    where: {
      email: normalized,
      purpose,
      consumedAt: null,
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    const secondsLeft = Math.max(
      1,
      RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - recent.createdAt.getTime()) / 1000),
    );
    const err = new Error(`Please wait ${secondsLeft}s before requesting another code.`);
    err.status = 429;
    throw err;
  }

  // Invalidate any prior codes for this email/purpose so only the latest works.
  await prisma.emailOtp.updateMany({
    where: { email: normalized, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + EXPIRES_MINUTES * 60 * 1000);

  await prisma.emailOtp.create({
    data: { email: normalized, codeHash, purpose, expiresAt },
  });

  await sendOtpEmail(normalized, code, EXPIRES_MINUTES);

  return { expiresAt, expiresMinutes: EXPIRES_MINUTES };
}

async function verifyOtp(email, code, purpose = 'SIGNUP') {
  const normalized = String(email).toLowerCase().trim();
  const record = await prisma.emailOtp.findFirst({
    where: { email: normalized, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    const err = new Error('No active verification code. Request a new one.');
    err.status = 400;
    throw err;
  }
  if (record.expiresAt < new Date()) {
    const err = new Error('Code has expired. Request a new one.');
    err.status = 400;
    throw err;
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    const err = new Error('Too many attempts. Request a new code.');
    err.status = 429;
    throw err;
  }

  const ok = await bcrypt.compare(String(code || '').trim(), record.codeHash);

  if (!ok) {
    await prisma.emailOtp.update({
      where: { id: record.id },
      data:  { attempts: { increment: 1 } },
    });
    const err = new Error('Incorrect verification code.');
    err.status = 400;
    throw err;
  }

  await prisma.emailOtp.update({
    where: { id: record.id },
    data:  { consumedAt: new Date() },
  });

  return true;
}

// Was a valid OTP verified for this email/purpose in the last N minutes?
async function isEmailRecentlyVerified(email, purpose = 'SIGNUP', withinMinutes = 30) {
  const normalized = String(email).toLowerCase().trim();
  const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
  const record = await prisma.emailOtp.findFirst({
    where: {
      email: normalized,
      purpose,
      consumedAt: { gte: cutoff, not: null },
    },
    orderBy: { consumedAt: 'desc' },
  });
  return Boolean(record);
}

module.exports = { issueOtp, verifyOtp, isEmailRecentlyVerified };
