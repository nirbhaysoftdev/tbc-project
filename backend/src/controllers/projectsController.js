// src/controllers/projectsController.js
const fs = require('fs');
const path = require('path');
const prisma = require('../utils/prismaClient');
const { memberCardSelect } = require('../services/memberVisibility');
const { logActivity } = require('../services/activityLog');
const i18n = require('../services/i18n/translationService');
const mediaCtrl = require('./projectMediaController');
const investmentRequestController = require('./investmentRequestController');
const { sanitizeRichText, richTextToPlain } = require('../services/richText');
const { normalizePeopleFields } = require('../services/projectPeople');
const { stripPrivateContact, stripPrivateContactMany } = require('../services/contactPrivacy');
const { isAdmin, LIVE_USER } = require('../utils/roles');

// ── Shared shaping ────────────────────────────
// `valuation` is the showcase figure and is always euros; `targetAmount` is the
// funding ask the wallet ledger works from. A project created before the
// showcase module has no valuation, so fall back to the ask rather than
// showing a card with no figure on it.
const displayValuation = (p) =>
  (p.valuation !== null && p.valuation !== undefined ? p.valuation : p.targetAmount) || 0;

/**
 * The banner image, as a ticketed stream URL.
 *
 * `bannerDocId` is the admin's explicit choice; when it is unset or points at
 * a document that has since been deleted, the newest image on the project is
 * used, which is what someone uploading a banner and nothing else expects.
 * Returns null when the project has no images at all — the client then draws
 * its gradient placeholder.
 */
const bannerFor = (project, userId) => {
  const images = (project.documents || []).filter((d) => d.kind === 'IMAGE');
  if (images.length === 0) return null;
  const chosen = images.find((d) => d.id === project.bannerDocId) || images[0];
  return mediaCtrl.streamUrlFor({ projectId: project.id, docId: chosen.id, userId });
};

// Sorts the listing offers. Whitelisted rather than passed through: `sort` is
// a query parameter and must never reach Prisma as an arbitrary field name.
const ORDER_BY = {
  newest:          { createdAt: 'desc' },
  oldest:          { createdAt: 'asc' },
  updated:         { updatedAt: 'desc' },
  valuation_desc:  { valuation: 'desc' },
  valuation_asc:   { valuation: 'asc' },
  title_asc:       { title: 'asc' },
  title_desc:      { title: 'desc' },
  established_desc:{ establishedAt: 'desc' },
};

// ── Get all projects (listing + Deal Room) ────
const getProjects = async (req, res) => {
  try {
    const {
      status, category, riskLevel, location, ownerId, managerId,
      q, minValuation, maxValuation, sort,
      page = 1, limit = 12,
    } = req.query;

    const where = {};
    if (category)  where.category  = category;
    if (riskLevel) where.riskLevel = riskLevel;
    if (ownerId)   where.ownerId   = ownerId;
    if (managerId) where.managerId = managerId;
    if (location)  where.location  = { contains: location, mode: 'insensitive' };

    // Status: an explicit value always wins. With none given, members see the
    // public deal room (ACTIVE only) while an admin sees everything, because
    // an admin managing projects needs their own DRAFTs to be visible. `ALL`
    // lets a member-facing screen ask for the unfiltered set deliberately.
    if (status && status !== 'ALL') {
      where.status = status;
    } else if (!status && !isAdmin(req.user.role)) {
      where.status = 'ACTIVE';
    }

    // Valuation range. Compared against `valuation`, with `targetAmount` as the
    // fallback for rows that predate it, so the filter and the figure shown on
    // the card can never disagree.
    const min = minValuation !== undefined && minValuation !== '' ? parseFloat(minValuation) : null;
    const max = maxValuation !== undefined && maxValuation !== '' ? parseFloat(maxValuation) : null;
    const range = {};
    if (min !== null && !Number.isNaN(min)) range.gte = min;
    if (max !== null && !Number.isNaN(max)) range.lte = max;
    if (Object.keys(range).length > 0) {
      where.OR = [
        { valuation: range },
        { valuation: null, targetAmount: range },
      ];
    }

    // Free-text search across the fields a member would actually type into:
    // the title, the short description, the category and the location. The
    // rich-text body is not searched — it is stored HTML, so a search for
    // "table" would match markup rather than words.
    const term = typeof q === 'string' ? q.trim() : '';
    if (term) {
      const like = { contains: term, mode: 'insensitive' };
      const search = [
        { title: like },
        { description: like },
        { category: like },
        { location: like },
        { primaryObjective: like },
        { owner: { name: like } },
      ];
      // Both a valuation range and a search term have to hold, so the two
      // OR-groups are combined with AND rather than overwriting each other.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: search }];
        delete where.OR;
      } else {
        where.OR = search;
      }
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 60);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          owner:   { select: memberCardSelect() },
          manager: { select: memberCardSelect() },
          // Metadata only: enough to resolve the banner, never a stored path.
          documents: {
            where:   { kind: 'IMAGE' },
            select:  { id: true, kind: true, uploadedAt: true },
            orderBy: { uploadedAt: 'desc' },
          },
          _count: { select: { investments: true, documents: true } },
          investments: {
            where: { investorId: req.user.id },
            select: { id: true, amount: true, sharePercentage: true },
          },
          walletInvestments: {
            where: { userId: req.user.id, status: 'ACTIVE' },
            select: { id: true, amount: true, returnedAmount: true, investedAt: true },
          },
          investmentRequests: {
            where: { userId: req.user.id, status: { in: ['PENDING', 'APPROVED'] } },
            select: { id: true, requestedAmount: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: ORDER_BY[sort] || ORDER_BY.newest,
        skip,
        take,
      }),
      prisma.project.count({ where }),
    ]);

    const enriched = projects.map(p => ({
      ...p,
      valuationEur:    displayValuation(p),
      bannerUrl:       bannerFor(p, req.user.id),
      mediaCount:      p._count.documents,
      fundingPct:      p.targetAmount > 0 ? Math.round((p.raisedAmount / p.targetAmount) * 100) : 0,
      investorCount:   p._count.investments,
      myInvestment:    p.investments[0] || null,
      myCapital:       p.walletInvestments.reduce((s, i) => s + Math.max(0, i.amount - (i.returnedAmount || 0)), 0),
      myPendingRequest: p.investmentRequests[0] || null,
      // The rich-text body is not sent to the listing: it is the largest field
      // on the row and no card renders it.
      detailsHtml:     undefined,
      documents:       undefined,
      investments:     undefined,
      walletInvestments: undefined,
      investmentRequests: undefined,
      _count:          undefined,
    }));

    // Serve the requested language, falling back to English per field. The
    // list is localised in one query for the whole page, not one per project.
    //
    // `onMissing: 'queue'` is safe here because this route sits behind
    // `authenticate` + `requireActive`: only approved members reach it, so an
    // anonymous visitor cannot use browsing to generate translation work
    // (§13). Note that `category`, `status` and `riskLevel` are untouched —
    // they are identifiers the frontend maps to its own keys.
    const localised = await i18n.localizeMany('Project', enriched, req.language, {
      onMissing: 'queue',
    });

    // The contact block and the enquiry recipient never reach a member — they
    // use Enquire Now instead (services/contactPrivacy.js). Applied here
    // rather than by narrowing the `select` above, so a column added to the
    // model later cannot leak by default.
    const visible = stripPrivateContactMany(localised, {
      kind: 'PROJECT',
      isAdmin: isAdmin(req.user.role),
    });

    res.json({
      projects: visible,
      pagination: {
        page: Math.max(parseInt(page, 10) || 1, 1),
        limit: take,
        total,
        pages: Math.max(1, Math.ceil(total / take)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Filter facets ─────────────────────────────
// The listing's Category, Location and Owner dropdowns, built from what is
// actually on the projects rather than a hardcoded list that drifts from the
// data. Owners come back as id + name only — the same projection members
// already see on a project card (services/memberVisibility.js).
const getFacets = async (req, res) => {
  try {
    const where = isAdmin(req.user.role) ? {} : { status: 'ACTIVE' };

    const [categories, locations, owners, bounds] = await Promise.all([
      prisma.project.groupBy({ by: ['category'], where, _count: { category: true } }),
      prisma.project.groupBy({ by: ['location'], where, _count: { location: true } }),
      prisma.project.findMany({
        where,
        distinct: ['ownerId'],
        select: { owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.project.aggregate({ where, _min: { valuation: true }, _max: { valuation: true } }),
    ]);

    res.json({
      categories: categories
        .filter((c) => c.category)
        .map((c) => ({ value: c.category, count: c._count.category }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      locations: locations
        .filter((l) => l.location)
        .map((l) => ({ value: l.location, count: l._count.location }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      owners: owners
        .map((o) => o.owner)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name)),
      statuses: ['DRAFT', 'ACTIVE', 'FUNDED', 'CLOSED', 'CANCELLED'],
      valuation: { min: bounds._min.valuation || 0, max: bounds._max.valuation || 0 },
    });
  } catch (err) {
    console.error('getFacets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Member search for the admin pickers ───────
// Owner, manager, team, investor, partner and client pickers all search the
// same list. Admin-only, and deliberately NOT the community directory: it has
// to find PENDING and FROZEN members too, which the member-facing directory
// hides.
//
// Only id, name and the professional fields a member already publishes come
// back — never an email address, a phone number or a KYC status. A picker
// needs enough to tell two people called the same thing apart, which company
// and job title do, and nothing more (services/memberVisibility.js).
const searchPeople = async (req, res) => {
  try {
    const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const take = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 25);

    const where = term
      ? { ...LIVE_USER, OR: [
          { name:  { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ] }
      : { ...LIVE_USER };

    const members = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        profilePhoto: true,
        profile: { select: { company: true, jobTitle: true, city: true, country: true } },
      },
      orderBy: { name: 'asc' },
      take,
    });

    res.json({ members });
  } catch (err) {
    console.error('searchPeople error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get single project ────────────────────────
const getProject = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        owner:   { select: memberCardSelect() },
        manager: { select: memberCardSelect() },
        // Media metadata only. The stored path never leaves the server, and
        // viewable URLs come from GET /projects/:id/media, which mints a
        // short-lived ticket per document. See projectMediaController.
        documents: {
          select: { id: true, name: true, type: true, kind: true,
                    mimeType: true, sizeBytes: true, uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
        },
        milestones:  { orderBy: { targetDate: 'asc' } },
        investments: {
          include: {
            investor: { select: memberCardSelect() },
          },
        },
        walletInvestments: {
          where: { userId: req.user.id, status: 'ACTIVE' },
          select: { id: true, amount: true, returnedAmount: true, investedAt: true },
        },
        investmentRequests: {
          where: { userId: req.user.id, status: { in: ['PENDING', 'APPROVED'] } },
          select: { id: true, requestedAmount: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { investments: true } },
      },
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // A DRAFT or CANCELLED project is not part of the showcase: only an admin
    // or the owner may open one by id, so guessing a URL does not reveal
    // something that was never published.
    const isManager = isAdmin(req.user.role) || project.ownerId === req.user.id;
    if (!isManager && !['ACTIVE', 'FUNDED', 'CLOSED'].includes(project.status)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const shaped = {
      ...project,
      valuationEur:  displayValuation(project),
      bannerUrl:     bannerFor(project, req.user.id),
      // `documents` carries the gallery's metadata; the ticketed URLs come
      // from GET /projects/:id/media, which the detail page calls anyway.
      fundingPct:    project.targetAmount > 0 ? Math.round((project.raisedAmount / project.targetAmount) * 100) : 0,
      investorCount: project._count.investments,
      myCapital:     project.walletInvestments.reduce((s, i) => s + Math.max(0, i.amount - (i.returnedAmount || 0)), 0),
      myPendingRequest: project.investmentRequests[0] || null,
      canManage:     isManager,
      walletInvestments: undefined,
      investmentRequests: undefined,
      _count:        undefined,
    };

    // The project and its milestones are separate entity types in the
    // translation registry, so each is localised against its own rows.
    const [localised, milestones] = await Promise.all([
      i18n.localizeOne('Project', shaped, req.language, { onMissing: 'queue' }),
      i18n.localizeMany('Milestone', shaped.milestones || [], req.language, { onMissing: 'queue' }),
    ]);

    res.json({
      project: stripPrivateContact(
        { ...localised, milestones },
        { kind: 'PROJECT', isAdmin: isAdmin(req.user.role) },
      ),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Field coercion shared by create and update ─
const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toFloat = (v) => {
  if (v === null || v === undefined || v === '') return null;
  // Tolerant of what a currency input produces: thousands separators, a comma
  // decimal, a stray € sign.
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};

const toText = (v, max = 500) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/**
 * A project URL, kept to http(s).
 * `javascript:` in this column would become a live link on the detail page,
 * so the scheme is checked here rather than hoped for in the UI.
 */
const toUrl = (v) => {
  const s = toText(v, 500);
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const parsed = new URL(withScheme);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

/** Resolve a manager id to a real user, or null. */
const resolveManagerId = async (managerId) => {
  const id = toText(managerId, 64);
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  return user ? user.id : null;
};

// ── Create project ────────────────────────────
const createProject = async (req, res) => {
  try {
    const {
      title, description, category,
      targetAmount, valuation, minInvestmentPct, shareType,
      riskLevel, fundingDeadline, targetIRR, location,
      primaryObjective, detailsHtml, establishedAt, bannerDocId,
      ownerId, managerId, url, contact, status,
    } = req.body;

    if (!title || !category) {
      return res.status(400).json({ error: 'title and category are required' });
    }

    // The showcase's headline figure. `targetAmount` keeps the ledger working
    // and defaults to the valuation when the admin is creating a showcase
    // project rather than a funding round.
    const valuationEur = toFloat(valuation);
    const ask = toFloat(targetAmount);
    if (valuationEur === null && ask === null) {
      return res.status(400).json({ error: 'valuation is required (in euros)' });
    }
    if ((valuationEur !== null && valuationEur < 0) || (ask !== null && ask < 0)) {
      return res.status(400).json({ error: 'Amounts cannot be negative' });
    }


    // Owner is chosen by the admin, not assumed to be whoever is logged in —
    // an admin creating a project on a member's behalf is the normal case. It
    // falls back to the creator so the column is never empty.
    let owner = req.user.id;
    const requestedOwner = toText(ownerId, 64);
    if (requestedOwner) {
      const found = await prisma.user.findUnique({ where: { id: requestedOwner }, select: { id: true } });
      if (!found) return res.status(400).json({ error: 'Selected owner is not a member' });
      owner = found.id;
    }

    const body = sanitizeRichText(detailsHtml);
    // The short description shown on cards. Derived from the rich-text body
    // when the admin only filled the editor in, so no card is left blank.
    const shortDescription =
      toText(description, 2000) || richTextToPlain(body, { limit: 300 }) || title;

    // `fundingDeadline` is required by the ledger. A showcase project with no
    // funding round gets a far-future date rather than forcing the admin to
    // invent one — the deal-room UI reads it, the showcase does not.
    const deadline = toDate(fundingDeadline)
      || new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);

    const people = await normalizePeopleFields(req.body);

    const project = await prisma.project.create({
      data: {
        ownerId:          owner,
        managerId:        await resolveManagerId(managerId),
        title:            toText(title, 200),
        description:      shortDescription,
        detailsHtml:      body,
        category:         toText(category, 80),
        valuation:        valuationEur !== null ? valuationEur : ask,
        targetAmount:     ask !== null ? ask : (valuationEur || 0),
        minInvestmentPct: toFloat(minInvestmentPct) ?? 5,
        shareType:        shareType   || 'LIMITED',
        riskLevel:        riskLevel   || 'MEDIUM',
        fundingDeadline:  deadline,
        targetIRR:        toFloat(targetIRR),
        location:         toText(location, 160),
        primaryObjective: toText(primaryObjective, 500),
        establishedAt:    toDate(establishedAt),
        bannerDocId:      toText(bannerDocId, 64),
        url:              toUrl(url),
        contact:          toText(contact, 300),
        status:           ['DRAFT', 'ACTIVE', 'FUNDED', 'CLOSED', 'CANCELLED'].includes(status)
                            ? status : 'ACTIVE',
        ...people,
      },
      include: {
        owner:   { select: memberCardSelect() },
        manager: { select: memberCardSelect() },
      },
    });

    // English is saved and committed above. Only then is translation work
    // scheduled, and registerSource never throws — a translation problem
    // cannot make this 201 fail (§6 "admin saves must not fail simply because
    // the translation provider is temporarily unavailable").
    await i18n.registerSource('Project', project.id, {
      title:            project.title,
      description:      project.description,
      primaryObjective: project.primaryObjective,
    });

    logActivity({
      type:        'PROJECT_CREATED',
      title:       `Project created: ${project.title}`,
      description: `${project.category} · valuation ${displayValuation(project).toLocaleString()}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      amount:      displayValuation(project),
      metadata:    { projectId: project.id, category: project.category, riskLevel: project.riskLevel },
    });

    res.status(201).json({ project: { ...project, valuationEur: displayValuation(project) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Update project ────────────────────────────
const updateProject = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.ownerId !== req.user.id && !isAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const b = req.body;
    const data = {};
    const has = (k) => b[k] !== undefined;

    if (has('title'))            data.title            = toText(b.title, 200) || project.title;
    if (has('category'))         data.category         = toText(b.category, 80) || project.category;
    if (has('location'))         data.location         = toText(b.location, 160);
    if (has('primaryObjective')) data.primaryObjective = toText(b.primaryObjective, 500);
    if (has('contact'))          data.contact          = toText(b.contact, 300);
    if (has('url'))              data.url              = toUrl(b.url);
    if (has('imageUrl'))         data.imageUrl         = toText(b.imageUrl, 500);
    if (has('bannerDocId'))      data.bannerDocId      = toText(b.bannerDocId, 64);
    if (has('establishedAt'))    data.establishedAt    = toDate(b.establishedAt);
    if (has('riskLevel'))        data.riskLevel        = b.riskLevel || project.riskLevel;
    if (has('shareType'))        data.shareType        = b.shareType || project.shareType;
    if (has('fundingDeadline'))  data.fundingDeadline  = toDate(b.fundingDeadline) || project.fundingDeadline;
    if (has('targetIRR'))        data.targetIRR        = toFloat(b.targetIRR);
    if (has('minInvestmentPct')) data.minInvestmentPct = toFloat(b.minInvestmentPct) ?? project.minInvestmentPct;

    if (has('status') && ['DRAFT', 'ACTIVE', 'FUNDED', 'CLOSED', 'CANCELLED'].includes(b.status)) {
      data.status = b.status;
    }

    // Amounts: a negative figure is rejected rather than quietly stored, and a
    // field cleared in the form becomes null rather than 0, which would read
    // as "worth nothing" on the card.
    if (has('valuation')) {
      const v = toFloat(b.valuation);
      if (v !== null && v < 0) return res.status(400).json({ error: 'Valuation cannot be negative' });
      data.valuation = v;
    }
    if (has('targetAmount')) {
      const v = toFloat(b.targetAmount);
      if (v !== null && v < 0) return res.status(400).json({ error: 'Target amount cannot be negative' });
      if (v !== null) data.targetAmount = v;
    }

    // Owner can be reassigned by an admin only: letting an owner hand their
    // own project to someone else is not a flow this module has.
    if (has('ownerId') && isAdmin(req.user.role)) {
      const next = toText(b.ownerId, 64);
      if (next && next !== project.ownerId) {
        const found = await prisma.user.findUnique({ where: { id: next }, select: { id: true } });
        if (!found) return res.status(400).json({ error: 'Selected owner is not a member' });
        data.ownerId = found.id;
      }
    }

    if (has('managerId')) data.managerId = await resolveManagerId(b.managerId);

    // The rich-text body, sanitised on the way in (services/richText.js).
    if (has('detailsHtml')) {
      data.detailsHtml = sanitizeRichText(b.detailsHtml);
      // Keep the card's short description in step when it was only ever
      // derived from the body, rather than written separately.
      if (!has('description')) {
        const derived = richTextToPlain(data.detailsHtml, { limit: 300 });
        const wasDerived = !project.description
          || project.description === richTextToPlain(project.detailsHtml, { limit: 300 });
        if (wasDerived && derived) data.description = derived;
      }
    }
    if (has('description')) {
      data.description = toText(b.description, 2000) || project.description;
    }

    Object.assign(data, await normalizePeopleFields(b));

    // `updatedAt` is `@updatedAt`, so the "last modified" date the detail page
    // shows is maintained by Prisma on every write here — nothing to set.
    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data,
      include: {
        owner:   { select: memberCardSelect() },
        manager: { select: memberCardSelect() },
      },
    });

    // registerSource hashes the fields, works out which actually changed,
    // bumps the source version, marks the superseded translations OUTDATED and
    // queues only the changed field/language pairs. A status-only edit queues
    // nothing.
    await i18n.registerSource('Project', updated.id, {
      title:            updated.title,
      description:      updated.description,
      primaryObjective: updated.primaryObjective,
    });

    res.json({ project: { ...updated, valuationEur: displayValuation(updated) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Invest in a project ───────────────────────
// Members cannot move money themselves: "Invest Now" raises an investment
// request, the member pays offline, and an admin completes it with the actual
// amount received. See investmentRequestController.
const invest = async (req, res) => {
  const { amount, notes, message } = req.body;
  req.body = { projectId: req.params.id, requestedAmount: amount, message: message || notes };
  return investmentRequestController.createRequest(req, res);
};

// ── Add milestone ─────────────────────────────
const addMilestone = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.ownerId !== req.user.id && !isAdmin(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { title, description, targetDate, amount } = req.body;
    if (!title || !targetDate || !amount) {
      return res.status(400).json({ error: 'title, targetDate, amount are required' });
    }

    const milestone = await prisma.milestone.create({
      data: {
        projectId:   req.params.id,
        title,
        description: description || null,
        targetDate:  new Date(targetDate),
        amount:      parseFloat(amount),
      },
    });

    await i18n.registerSource('Milestone', milestone.id, {
      title:       milestone.title,
      description: milestone.description,
    });

    res.status(201).json({ milestone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Delete project ────────────────────────────
const deleteProject = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // project_documents cascades in the database, which would strand the files
    // themselves on disk, so collect the paths before the rows disappear.
    const documents = await prisma.projectDocument.findMany({
      where:  { projectId: project.id },
      select: { fileUrl: true },
    });

    await prisma.project.delete({ where: { id: req.params.id } });

    documents.forEach((d) => {
      fs.unlink(path.join(mediaCtrl.MEDIA_DIR, path.basename(d.fileUrl)), () => {});
    });

    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── My investments ────────────────────────────
const getMyInvestments = async (req, res) => {
  try {
    const investments = await prisma.investment.findMany({
      where:   { investorId: req.user.id },
      include: {
        project: {
          select: {
            id: true, title: true, category: true, status: true,
            targetAmount: true, raisedAmount: true, targetIRR: true,
            valuation: true, fundingDeadline: true, imageUrl: true,
            owner: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { investedAt: 'desc' },
    });
    res.json({ investments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getProjects, getFacets, getProject, searchPeople, createProject, updateProject,
  deleteProject, invest, addMilestone, getMyInvestments,
};
