// src/controllers/eventsController.js
const prisma = require('../utils/prismaClient');

// ── Get all events ────────────────────────────
const getEvents = async (req, res) => {
  try {
    const { type, upcoming, page = 1, limit = 20 } = req.query;
    const where = {};
    if (type) where.type = type;
    if (upcoming === 'true') where.startDate = { gte: new Date() };

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          _count: { select: { registrations: true } },
          registrations: { where: { userId: req.user.id }, select: { id: true } },
        },
        orderBy: { startDate: 'asc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.event.count({ where }),
    ]);

    const enriched = events.map(e => ({
      ...e,
      attendeeCount:  e._count.registrations,
      registeredByMe: e.registrations.length > 0,
      registrations: undefined,
      _count: undefined,
    }));

    res.json({ events: enriched, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get single event ──────────────────────────
const getEvent = async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { registrations: true } },
        registrations: {
          include: {
            user: { select: { id: true, name: true, profilePhoto: true, membershipTier: true } },
          },
        },
      },
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Create event (admin only) ─────────────────
const createEvent = async (req, res) => {
  try {
    const { title, description, type, startDate, endDate, location, isOnline, maxAttendees, imageUrl } = req.body;

    if (!title || !startDate || !endDate) {
      return res.status(400).json({ error: 'Title, startDate, and endDate are required' });
    }

    const event = await prisma.event.create({
      data: {
        title, description,
        type:        type       || 'NETWORKING',
        startDate:   new Date(startDate),
        endDate:     new Date(endDate),
        location:    location   || null,
        isOnline:    isOnline   ?? false,
        maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
        imageUrl:    imageUrl   || null,
        createdBy:   req.user.id,
      },
    });

    res.status(201).json({ event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Update event (admin only) ─────────────────
const updateEvent = async (req, res) => {
  try {
    const { title, description, type, startDate, endDate, location, isOnline, maxAttendees, imageUrl } = req.body;
    const data = {};
    if (title)        data.title        = title;
    if (description)  data.description  = description;
    if (type)         data.type         = type;
    if (startDate)    data.startDate    = new Date(startDate);
    if (endDate)      data.endDate      = new Date(endDate);
    if (location !== undefined) data.location = location;
    if (isOnline !== undefined) data.isOnline = isOnline;
    if (maxAttendees) data.maxAttendees = parseInt(maxAttendees);
    if (imageUrl)     data.imageUrl     = imageUrl;

    const event = await prisma.event.update({ where: { id: req.params.id }, data });
    res.json({ event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Delete event (admin only) ─────────────────
const deleteEvent = async (req, res) => {
  try {
    await prisma.event.delete({ where: { id: req.params.id } });
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Register for event ────────────────────────
const registerForEvent = async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { registrations: true } } },
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.maxAttendees && event._count.registrations >= event.maxAttendees) {
      return res.status(400).json({ error: 'Event is fully booked' });
    }

    const existing = await prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: req.params.id, userId: req.user.id } },
    });
    if (existing) return res.status(400).json({ error: 'Already registered' });

    await prisma.eventRegistration.create({
      data: { eventId: req.params.id, userId: req.user.id },
    });

    res.json({ message: 'Registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Cancel registration ───────────────────────
const cancelRegistration = async (req, res) => {
  try {
    await prisma.eventRegistration.deleteMany({
      where: { eventId: req.params.id, userId: req.user.id },
    });
    res.json({ message: 'Registration cancelled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getEvents, getEvent, createEvent, updateEvent, deleteEvent, registerForEvent, cancelRegistration };
