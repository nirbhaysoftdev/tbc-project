// src/controllers/memberCardController.js
//
// The TBC membership card: last four digits and an expiry, nothing else - a full
// number is never accepted or stored. Assigning, editing and switching a card
// on or off is super admin only (routes/superAdmin.js); a member can only read
// their own, and only while it is enabled (routes/dashboard.js).
const prisma = require('../utils/prismaClient');
const { logActivity } = require('../services/activityLog');
const { LIVE_USER } = require('../utils/roles');

const bad = (res, error) => res.status(400).json({ error });
const fmt = (c) => `•••• ${c.last4} · ${String(c.expiryMonth).padStart(2, '0')}/${String(c.expiryYear).slice(-2)}`;

const present = (c) => c && {
  last4: c.last4, expiryMonth: c.expiryMonth, expiryYear: c.expiryYear,
  enabled: c.enabled, updatedAt: c.updatedAt,
};

/** Validates the submitted fields; returns { last4, expiryMonth, expiryYear } or { error }. */
function parse(body) {
  const last4 = String(body.last4 ?? '').trim();
  if (!/^\d{4}$/.test(last4)) return { error: 'Enter exactly the last 4 digits of the card.' };
  const expiryMonth = Number(body.expiryMonth);
  const expiryYear  = Number(body.expiryYear);
  if (!Number.isInteger(expiryMonth) || expiryMonth < 1 || expiryMonth > 12) return { error: 'Expiry month must be 1–12.' };
  if (!Number.isInteger(expiryYear) || expiryYear < 2000 || expiryYear > 2100) return { error: 'Enter a valid 4-digit expiry year.' };
  return { last4, expiryMonth, expiryYear };
}

// Every member, with their card if one is assigned.
const list = async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { ...LIVE_USER, role: 'MEMBER' },
      select: { id: true, name: true, email: true, memberCard: true },
      orderBy: { name: 'asc' },
    });
    res.json({ members: users.map(u => ({ id: u.id, name: u.name, email: u.email, card: present(u.memberCard) })) });
  } catch (err) {
    console.error('memberCard list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Assign a card, or replace the details of the one already there. Enabled state is untouched on edit.
const upsert = async (req, res) => {
  try {
    const parsed = parse(req.body);
    if (parsed.error) return bad(res, parsed.error);

    const { userId } = req.params;
    const member = await prisma.user.findFirst({ where: { id: userId, ...LIVE_USER, role: 'MEMBER' }, select: { id: true, name: true } });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const before = await prisma.memberCard.findUnique({ where: { userId } });
    const card = await prisma.memberCard.upsert({
      where: { userId },
      create: { userId, ...parsed, createdBy: req.user.id },
      update: parsed,
    });

    logActivity({
      type: before ? 'MEMBER_CARD_UPDATED' : 'MEMBER_CARD_SET',
      title: `Member card ${before ? 'updated' : 'assigned'} · ${member.name}`,
      description: before ? `${fmt(before)} → ${fmt(card)}` : fmt(card),
      actorId: req.user.id, actorName: req.user.name, targetId: userId,
    });
    res.status(before ? 200 : 201).json({ card: present(card) });
  } catch (err) {
    console.error('memberCard upsert error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const setEnabled = async (req, res) => {
  try {
    if (typeof req.body.enabled !== 'boolean') return bad(res, 'enabled must be true or false.');
    const { userId } = req.params;
    const current = await prisma.memberCard.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
    if (!current) return res.status(404).json({ error: 'This member has no card yet.' });

    if (current.enabled !== req.body.enabled) {
      const card = await prisma.memberCard.update({ where: { userId }, data: { enabled: req.body.enabled } });
      logActivity({
        type: card.enabled ? 'MEMBER_CARD_ENABLED' : 'MEMBER_CARD_DISABLED',
        title: `Member card ${card.enabled ? 'enabled' : 'disabled'} · ${current.user.name}`,
        description: fmt(card),
        actorId: req.user.id, actorName: req.user.name, targetId: userId,
      });
      return res.json({ card: present(card) });
    }
    res.json({ card: present(current) });
  } catch (err) {
    console.error('memberCard setEnabled error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// The member's own card. null when none is assigned or it is switched off, so
// the page cannot tell the two apart and has nothing to show either way.
const mine = async (req, res) => {
  try {
    const card = await prisma.memberCard.findUnique({ where: { userId: req.user.id } });
    res.json({ card: card && card.enabled ? present(card) : null });
  } catch (err) {
    console.error('memberCard mine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { list, upsert, setEnabled, mine };
