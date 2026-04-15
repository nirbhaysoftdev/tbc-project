// src/controllers/communityController.js
const prisma = require('../utils/prismaClient');

// ── Get feed posts ────────────────────────────
const getFeed = async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const where = {};
    if (type) where.type = type;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          author: {
            select: {
              id: true, name: true, profilePhoto: true,
              membershipTier: true,
              profile: { select: { company: true, country: true, city: true } },
            },
          },
          _count: { select: { comments: true, likes: true } },
          likes:  { where: { userId: req.user.id }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.post.count({ where }),
    ]);

    const enriched = posts.map(p => ({
      ...p,
      likedByMe:    p.likes.length > 0,
      likesCount:   p._count.likes,
      commentsCount: p._count.comments,
      likes: undefined,
      _count: undefined,
    }));

    res.json({ posts: enriched, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Create post ───────────────────────────────
const createPost = async (req, res) => {
  try {
    const { type, title, content, location, dealAmount, dealIRR, dealSpots, eventDate } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const post = await prisma.post.create({
      data: {
        authorId:   req.user.id,
        type:       type || 'INSIGHT',
        title:      title || null,
        content:    content.trim(),
        location:   location || null,
        dealAmount: dealAmount ? parseFloat(dealAmount) : null,
        dealIRR:    dealIRR   ? parseFloat(dealIRR)    : null,
        dealSpots:  dealSpots ? parseInt(dealSpots)    : null,
        eventDate:  eventDate ? new Date(eventDate)    : null,
      },
      include: {
        author: {
          select: {
            id: true, name: true, profilePhoto: true,
            membershipTier: true,
            profile: { select: { company: true, country: true } },
          },
        },
      },
    });

    res.status(201).json({ post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Delete post ───────────────────────────────
const deletePost = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await prisma.post.delete({ where: { id: req.params.id } });
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Toggle like ───────────────────────────────
const toggleLike = async (req, res) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user.id;

    const existing = await prisma.like.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
      res.json({ liked: false });
    } else {
      await prisma.like.create({ data: { postId, userId } });
      res.json({ liked: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get comments for a post ───────────────────
const getComments = async (req, res) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { postId: req.params.id },
      include: {
        author: {
          select: { id: true, name: true, profilePhoto: true, membershipTier: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Add comment ───────────────────────────────
const addComment = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const comment = await prisma.comment.create({
      data: { postId: req.params.id, authorId: req.user.id, content: content.trim() },
      include: {
        author: { select: { id: true, name: true, profilePhoto: true, membershipTier: true } },
      },
    });
    res.status(201).json({ comment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get member directory ──────────────────────
const getMembers = async (req, res) => {
  try {
    const { search, tier, industry, page = 1, limit = 24 } = req.query;
    const where = { role: 'MEMBER', status: 'ACTIVE' };

    if (tier) where.membershipTier = tier;
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { profile: { company:  { contains: search, mode: 'insensitive' } } },
        { profile: { industry: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (industry) {
      where.profile = { industry: { contains: industry, mode: 'insensitive' } };
    }

    const [members, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, profilePhoto: true,
          membershipTier: true, createdAt: true,
          profile: { select: { company: true, industry: true, country: true, bio: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ members, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get single member profile ─────────────────
const getMemberProfile = async (req, res) => {
  try {
    const member = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, profilePhoto: true,
        membershipTier: true, kycStatus: true, createdAt: true,
        profile: true,
        membership: true,
        _count: { select: { posts: true, investments: true, projectsOwned: true } },
      },
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json({ member });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Update own profile ────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { bio, company, industry, country, city, phone, linkedIn, website, interests } = req.body;

    const profile = await prisma.profile.upsert({
      where:  { userId: req.user.id },
      update: { bio, company, industry, country, city, phone, linkedIn, website, interests: interests || [] },
      create: { userId: req.user.id, bio, company, industry, country, city, phone, linkedIn, website, interests: interests || [] },
    });

    res.json({ profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get notifications ─────────────────────────
const getNotifications = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where:   { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, read: false },
    });
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Mark notification as read ─────────────────
const markNotificationRead = async (req, res) => {
  try {
    if (req.params.id === 'all') {
      await prisma.notification.updateMany({
        where: { userId: req.user.id, read: false },
        data:  { read: true },
      });
    } else {
      await prisma.notification.updateMany({
        where: { id: req.params.id, userId: req.user.id },
        data:  { read: true },
      });
    }
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Community stats (for homepage widgets) ────
const getCommunityStats = async (req, res) => {
  try {
    const [totalMembers, activePosts, activeProjects] = await Promise.all([
      prisma.user.count({ where: { role: 'MEMBER', status: 'ACTIVE' } }),
      prisma.post.count(),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
    ]);
    res.json({ totalMembers, activePosts, activeProjects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getFeed, createPost, deletePost, toggleLike,
  getComments, addComment,
  getMembers, getMemberProfile, updateProfile,
  getNotifications, markNotificationRead,
  getCommunityStats,
};
