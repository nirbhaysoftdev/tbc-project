// src/controllers/messagesController.js
const prisma = require('../utils/prismaClient');

// ── Get conversations (inbox) ─────────────────
// Returns one latest message per unique conversation partner
const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all unique conversation partners
    const sent     = await prisma.message.findMany({ where: { senderId: userId },   select: { receiverId: true } });
    const received = await prisma.message.findMany({ where: { receiverId: userId }, select: { senderId: true } });

    const partnerIds = [
      ...new Set([
        ...sent.map(m => m.receiverId),
        ...received.map(m => m.senderId),
      ]),
    ].filter(id => id !== userId);

    const conversations = await Promise.all(
      partnerIds.map(async (partnerId) => {
        const lastMessage = await prisma.message.findFirst({
          where: {
            OR: [
              { senderId: userId,   receiverId: partnerId },
              { senderId: partnerId, receiverId: userId },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        const unreadCount = await prisma.message.count({
          where: { senderId: partnerId, receiverId: userId, read: false },
        });

        const partner = await prisma.user.findUnique({
          where:  { id: partnerId },
          select: { id: true, name: true, profilePhoto: true, membershipTier: true,
                    profile: { select: { company: true } } },
        });

        return { partner, lastMessage, unreadCount };
      })
    );

    // Sort by last message time descending
    conversations.sort((a, b) =>
      new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0)
    );

    res.json({ conversations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get messages with a specific user ─────────
const getMessages = async (req, res) => {
  try {
    const userId    = req.user.id;
    const partnerId = req.params.partnerId;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId,    receiverId: partnerId },
          { senderId: partnerId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Mark received messages as read
    await prisma.message.updateMany({
      where: { senderId: partnerId, receiverId: userId, read: false },
      data:  { read: true },
    });

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Send a message ────────────────────────────
const sendMessage = async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    if (!receiverId || !content?.trim()) {
      return res.status(400).json({ error: 'receiverId and content are required' });
    }
    if (receiverId === req.user.id) {
      return res.status(400).json({ error: 'Cannot message yourself' });
    }

    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) return res.status(404).json({ error: 'Recipient not found' });

    const message = await prisma.message.create({
      data: { senderId: req.user.id, receiverId, content: content.trim() },
    });

    // Create notification for receiver
    await prisma.notification.create({
      data: {
        userId:  receiverId,
        type:    'NEW_MESSAGE',
        title:   'New message',
        message: `${req.user.name} sent you a message`,
        link:    `/community/messages`,
        data:    { senderId: req.user.id },
      },
    });

    res.status(201).json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Unread count ──────────────────────────────
const getUnreadCount = async (req, res) => {
  try {
    const count = await prisma.message.count({
      where: { receiverId: req.user.id, read: false },
    });
    res.json({ unreadCount: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getConversations, getMessages, sendMessage, getUnreadCount };
