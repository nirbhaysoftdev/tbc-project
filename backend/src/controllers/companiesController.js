// src/controllers/companiesController.js
//
// Company profile management: the directory, one profile, and admin create /
// edit / delete.
//
// Shaped after projectsController.js on purpose. The search, filter, sort and
// pagination contract is the same, the rich-text body goes through the same
// sanitiser, and the people lists go through the same normaliser, so the two
// modules behave identically and the frontend can reuse its whole design
// system rather than growing a second one.
const fs = require('fs');
const path = require('path');
const prisma = require('../utils/prismaClient');
const { memberCardSelect } = require('../services/memberVisibility');
const { logActivity } = require('../services/activityLog');
const i18n = require('../services/i18n/translationService');
const mediaCtrl = require('./companyMediaController');
const { sanitizeRichText, richTextToPlain } = require('../services/richText');
const { normalizePeople } = require('../services/projectPeople');
const { stripPrivateContact, stripPrivateContactMany } = require('../services/contactPrivacy');

const STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];

// Sorts the listing offers. Whitelisted rather than passed through: `sort` is a
// query parameter and must never reach Prisma as an arbitrary field name.
const ORDER_BY = {
  newest:          { createdAt: 'desc' },
  oldest:          { createdAt: 'asc' },
  updated:         { updatedAt: 'desc' },
  valuation_desc:  { valuation: 'desc' },
  valuation_asc:   { valuation: 'asc' },
  name_asc:        { name: 'asc' },
  name_desc:       { name: 'desc' },
  established_desc:{ establishedAt: 'desc' },
};

// ── Field coercion ────────────────────────────
const toText = (v, max = 500) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

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

/** An http(s) URL, or null. A `javascript:` URL here would become a live link. */
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

const toEmail = (v) => {
  const s = toText(v, 200);
  if (!s) return null;
  // Deliberately loose: the point is to reject something that is obviously not
  // an address, not to adjudicate RFC 5322.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};

/**
 * The company's locations.
 *
 * A scalar string list rather than JSON, because the listing filters it with
 * `has`, which Postgres can answer from the GIN index on the column.
 */
const toLocations = (raw) => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return [];

  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch { value = value.split(','); }   // a plain comma-separated list
  }
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const out = [];
  for (const item of value) {
    // Accept both "Milan" and { name: 'Milan' } / { value: 'Milan' }, which is
    // what a tag input might send.
    const name = toText(typeof item === 'object' && item ? (item.name ?? item.value) : item, 160);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 30) break;
  }
  return out;
};

// ── Presentation video links ──────────────────
// An embedded video is someone else's page running inside the portal, so only
// YouTube and Vimeo are accepted and each URL is rewritten into its canonical
// embed form. A link that is not one of those is dropped rather than framed.
const VIDEO_PROVIDERS = [
  {
    name: 'youtube',
    match: /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/,
    embed: (id) => `https://www.youtube-nocookie.com/embed/${id}`,
  },
  {
    name: 'vimeo',
    match: /vimeo\.com\/(?:video\/)?(\d{6,12})/,
    embed: (id) => `https://player.vimeo.com/video/${id}`,
  },
];

const normalizeVideoLinks = (raw) => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return [];

  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch { value = value.split(/[\s,]+/); }
  }
  if (!Array.isArray(value)) return [];

  const out = [];
  const seen = new Set();
  for (const item of value) {
    const url   = toText(typeof item === 'object' && item ? item.url : item, 500);
    const title = toText(typeof item === 'object' && item ? item.title : null, 160);
    if (!url) continue;

    const provider = VIDEO_PROVIDERS.find((p) => p.match.test(url));
    if (!provider) continue;              // not an allowed provider: dropped
    const id = url.match(provider.match)[1];
    const embedUrl = provider.embed(id);
    if (seen.has(embedUrl)) continue;
    seen.add(embedUrl);

    out.push({ url: embedUrl, title: title || 'Presentation', provider: provider.name });
    if (out.length >= 12) break;
  }
  return out;
};

// ── Shared shaping ────────────────────────────
/** Logo and banner as ticketed stream URLs, with a sensible fallback. */
const imagesFor = (company, userId) => {
  const docs = company.documents || [];
  const logoDoc = docs.find((d) => d.id === company.logoDocId)
    // No explicit choice: the most recent upload marked LOGO.
    || docs.find((d) => d.purpose === 'LOGO' && d.kind === 'IMAGE');
  const bannerDoc = docs.find((d) => d.id === company.bannerDocId)
    || docs.find((d) => d.purpose === 'BANNER' && d.kind === 'IMAGE')
    // Last resort: any image, so a profile with one upload still looks filled.
    || docs.find((d) => d.kind === 'IMAGE');

  return {
    logoUrl: logoDoc
      ? mediaCtrl.streamUrlFor({ companyId: company.id, docId: logoDoc.id, userId })
      : null,
    bannerUrl: bannerDoc
      ? mediaCtrl.streamUrlFor({ companyId: company.id, docId: bannerDoc.id, userId })
      : null,
  };
};

// ── List companies ────────────────────────────
const getCompanies = async (req, res) => {
  try {
    const {
      q, category, location, status, ownerId,
      minValuation, maxValuation, sort,
      page = 1, limit = 12,
    } = req.query;

    const where = {};
    if (category) where.category = category;
    // `has` on the scalar list, which is an index scan rather than a scan of
    // every row's JSON.
    if (location) where.locations = { has: location };
    if (ownerId)  where.ownerIds  = { has: ownerId };

    // An explicit status always wins. With none given, members see only live
    // profiles while an admin sees everything, because an admin managing the
    // directory needs their own drafts to be visible.
    if (status && status !== 'ALL') {
      where.status = status;
    } else if (!status && req.user.role !== 'ADMIN') {
      where.status = 'ACTIVE';
    }

    const min = minValuation !== undefined && minValuation !== '' ? parseFloat(minValuation) : null;
    const max = maxValuation !== undefined && maxValuation !== '' ? parseFloat(maxValuation) : null;
    const range = {};
    if (min !== null && !Number.isNaN(min)) range.gte = min;
    if (max !== null && !Number.isNaN(max)) range.lte = max;
    if (Object.keys(range).length > 0) where.valuation = range;

    // Free-text search over what a member would actually type. The rich-text
    // body is not searched: it is stored HTML, so a search for "table" would
    // match markup rather than words.
    const term = typeof q === 'string' ? q.trim() : '';
    if (term) {
      const like = { contains: term, mode: 'insensitive' };
      where.OR = [
        { name: like },
        { description: like },
        { category: like },
        { contactPerson: like },
        { locations: { has: term } },
        // Owner by name: the display copy in `owners` cannot be searched with
        // `contains`, so the creator's name and the owner ids are matched
        // through the relation instead.
        { createdBy: { name: like } },
      ];
    }

    const take = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 60);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: {
          createdBy: { select: memberCardSelect() },
          // Metadata only, and only the images: enough to resolve the logo and
          // banner without sending a stored path anywhere.
          documents: {
            where:   { kind: 'IMAGE' },
            select:  { id: true, kind: true, purpose: true, uploadedAt: true },
            orderBy: { uploadedAt: 'desc' },
          },
          _count: { select: { documents: true } },
        },
        orderBy: ORDER_BY[sort] || ORDER_BY.newest,
        skip,
        take,
      }),
      prisma.company.count({ where }),
    ]);

    const enriched = companies.map((c) => ({
      ...c,
      ...imagesFor(c, req.user.id),
      mediaCount:  c._count.documents,
      // The rich-text body is the largest column on the row and no card
      // renders it.
      detailsHtml: undefined,
      documents:   undefined,
      _count:      undefined,
    }));

    // One query localises the whole page, not one per company. `onMissing:
    // 'queue'` is safe behind `authenticate` + `requireActive`: only approved
    // members reach this route, so browsing cannot be used to generate
    // translation work.
    const localised = await i18n.localizeMany('Company', enriched, req.language, {
      onMissing: 'queue',
    });

    // Contact addresses, phone numbers and the enquiry recipient never reach a
    // member — they use Connect Now instead (services/contactPrivacy.js).
    // Applied here rather than by narrowing the `select` above, so a column
    // added to the model later cannot leak by default.
    const visible = stripPrivateContactMany(localised, {
      kind: 'COMPANY',
      isAdmin: req.user.role === 'ADMIN',
    });

    res.json({
      companies: visible,
      pagination: {
        page:  Math.max(parseInt(page, 10) || 1, 1),
        limit: take,
        total,
        pages: Math.max(1, Math.ceil(total / take)),
      },
    });
  } catch (err) {
    console.error('getCompanies error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Filter facets ─────────────────────────────
// The Category, Location and Owner dropdowns, built from what is actually on
// the companies rather than a hardcoded list that drifts from the data.
const getFacets = async (req, res) => {
  try {
    const where = req.user.role === 'ADMIN' ? {} : { status: 'ACTIVE' };

    const [categories, rows, bounds] = await Promise.all([
      prisma.company.groupBy({ by: ['category'], where, _count: { category: true } }),
      // Locations and owners live in array columns, so they are counted here
      // rather than with groupBy, which cannot group by an element.
      prisma.company.findMany({ where, select: { locations: true, owners: true } }),
      prisma.company.aggregate({ where, _min: { valuation: true }, _max: { valuation: true } }),
    ]);

    const locationCounts = new Map();
    const owners = new Map();
    for (const row of rows) {
      (row.locations || []).forEach((loc) => {
        locationCounts.set(loc, (locationCounts.get(loc) || 0) + 1);
      });
      // Only owners that are portal members can be filtered on, because the
      // filter matches `ownerIds`.
      (Array.isArray(row.owners) ? row.owners : []).forEach((owner) => {
        if (owner && owner.id && owner.name && !owners.has(owner.id)) {
          owners.set(owner.id, { id: owner.id, name: owner.name });
        }
      });
    }

    res.json({
      categories: categories
        .filter((c) => c.category)
        .map((c) => ({ value: c.category, count: c._count.category }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      locations: [...locationCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      owners: [...owners.values()].sort((a, b) => a.name.localeCompare(b.name)),
      statuses: STATUSES,
      valuation: { min: bounds._min.valuation || 0, max: bounds._max.valuation || 0 },
    });
  } catch (err) {
    console.error('company getFacets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── One company ───────────────────────────────
const getCompany = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: memberCardSelect() },
        // Metadata only. Viewable URLs come from GET /companies/:id/media,
        // which mints a short-lived ticket per document.
        documents: {
          select: { id: true, name: true, kind: true, purpose: true,
                    mimeType: true, sizeBytes: true, uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!company) return res.status(404).json({ error: 'Company not found' });

    // A draft or archived profile is not part of the directory: only an admin
    // may open one by id, so guessing a URL reveals nothing unpublished.
    const isAdmin = req.user.role === 'ADMIN';
    if (!isAdmin && company.status !== 'ACTIVE' && company.status !== 'INACTIVE') {
      return res.status(404).json({ error: 'Company not found' });
    }

    const shaped = {
      ...company,
      ...imagesFor(company, req.user.id),
      canManage: isAdmin,
    };

    const localised = await i18n.localizeOne('Company', shaped, req.language, { onMissing: 'queue' });

    res.json({
      company: stripPrivateContact(localised, { kind: 'COMPANY', isAdmin }),
    });
  } catch (err) {
    console.error('getCompany error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Create ────────────────────────────────────
const createCompany = async (req, res) => {
  try {
    const b = req.body;

    const name = toText(b.name, 200);
    const category = toText(b.category, 80);
    if (!name)     return res.status(400).json({ error: 'A company name is required' });
    if (!category) return res.status(400).json({ error: 'A category is required' });

    const valuation = toFloat(b.valuation);
    if (valuation !== null && valuation < 0) {
      return res.status(400).json({ error: 'Valuation cannot be negative' });
    }


    const detailsHtml = sanitizeRichText(b.detailsHtml);
    // The short line the card shows. Derived from the opening of the body when
    // the admin only filled the editor in, so no card is left blank.
    const description = toText(b.description, 2000)
      || richTextToPlain(detailsHtml, { limit: 300 })
      || null;

    const owners = (await normalizePeople(b.owners !== undefined ? b.owners : b.ownerIds)) || [];
    const teamMembers = (await normalizePeople(b.teamMembers !== undefined ? b.teamMembers : b.teamMemberIds)) || [];
    const videoLinks = normalizeVideoLinks(b.videoLinks) || [];

    const company = await prisma.company.create({
      data: {
        name,
        category,
        status:        STATUSES.includes(b.status) ? b.status : 'ACTIVE',
        description,
        detailsHtml,
        valuation,
        establishedAt: toDate(b.establishedAt),
        owners,
        // The member ids, kept beside the display list so the owner filter has
        // something indexable to match.
        ownerIds:      owners.map((o) => o.id).filter(Boolean),
        locations:     toLocations(b.locations) || [],
        teamMembers,
        websiteUrl:    toUrl(b.websiteUrl),
        contactPerson: toText(b.contactPerson, 160),
        contactEmail:  toEmail(b.contactEmail),
        contactPhone:  toText(b.contactPhone, 60),
        videoLinks,
        createdById:   req.user.id,
      },
      include: { createdBy: { select: memberCardSelect() } },
    });

    // English is saved and committed above. Only then is translation work
    // scheduled, and registerSource never throws — a translation problem
    // cannot make this 201 fail.
    await i18n.registerSource('Company', company.id, {
      name:          company.name,
      description:   company.description,
      detailsHtml:   company.detailsHtml,
      contactPerson: company.contactPerson,
    });

    logActivity({
      type:        'COMPANY_CREATED',
      title:       `Company profile created: ${company.name}`,
      description: `${company.category}${valuation ? ` · valuation ${valuation.toLocaleString()}` : ''}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      amount:      valuation || 0,
      metadata:    { companyId: company.id, category: company.category },
    });

    res.status(201).json({ company });
  } catch (err) {
    console.error('createCompany error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Update ────────────────────────────────────
const updateCompany = async (req, res) => {
  try {
    const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Company not found' });

    const b = req.body;
    const has = (k) => b[k] !== undefined;
    const data = {};

    if (has('name'))          data.name          = toText(b.name, 200) || existing.name;
    if (has('category'))      data.category      = toText(b.category, 80) || existing.category;
    if (has('establishedAt')) data.establishedAt = toDate(b.establishedAt);
    if (has('websiteUrl'))    data.websiteUrl    = toUrl(b.websiteUrl);
    if (has('contactPerson')) data.contactPerson = toText(b.contactPerson, 160);
    if (has('contactEmail'))  data.contactEmail  = toEmail(b.contactEmail);
    if (has('contactPhone'))  data.contactPhone  = toText(b.contactPhone, 60);
    if (has('logoDocId'))     data.logoDocId     = toText(b.logoDocId, 64);
    if (has('bannerDocId'))   data.bannerDocId   = toText(b.bannerDocId, 64);

    if (has('status') && STATUSES.includes(b.status)) data.status = b.status;

    if (has('valuation')) {
      const v = toFloat(b.valuation);
      if (v !== null && v < 0) return res.status(400).json({ error: 'Valuation cannot be negative' });
      // Cleared in the form becomes null, not 0, which would read as "worth
      // nothing" on the card.
      data.valuation = v;
    }

    if (has('locations')) data.locations = toLocations(b.locations);

    if (has('owners') || has('ownerIds')) {
      const owners = (await normalizePeople(has('owners') ? b.owners : b.ownerIds)) || [];
      data.owners   = owners;
      data.ownerIds = owners.map((o) => o.id).filter(Boolean);
    }

    if (has('teamMembers') || has('teamMemberIds')) {
      data.teamMembers = (await normalizePeople(has('teamMembers') ? b.teamMembers : b.teamMemberIds)) || [];
    }

    if (has('videoLinks')) data.videoLinks = normalizeVideoLinks(b.videoLinks);

    // The rich-text body, sanitised on the way in (services/richText.js).
    if (has('detailsHtml')) {
      data.detailsHtml = sanitizeRichText(b.detailsHtml);
      // Keep the card's short description in step when it was only ever
      // derived from the body rather than written separately.
      if (!has('description')) {
        const derived = richTextToPlain(data.detailsHtml, { limit: 300 });
        const wasDerived = !existing.description
          || existing.description === richTextToPlain(existing.detailsHtml, { limit: 300 });
        if (wasDerived && derived) data.description = derived;
      }
    }
    if (has('description')) data.description = toText(b.description, 2000);

    // `updatedAt` is `@updatedAt`, so the "last modified" date the profile
    // shows is maintained by Prisma on every write here.
    const company = await prisma.company.update({
      where:   { id: req.params.id },
      data,
      include: { createdBy: { select: memberCardSelect() } },
    });

    // registerSource works out which fields actually changed, bumps the source
    // version, marks the superseded translations OUTDATED and queues only the
    // changed field/language pairs. A status-only edit queues nothing.
    await i18n.registerSource('Company', company.id, {
      name:          company.name,
      description:   company.description,
      detailsHtml:   company.detailsHtml,
      contactPerson: company.contactPerson,
    });

    res.json({ company });
  } catch (err) {
    console.error('updateCompany error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Delete ────────────────────────────────────
const deleteCompany = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // company_documents cascades in the database, which would strand the files
    // themselves on disk, so collect the paths before the rows disappear.
    const documents = await prisma.companyDocument.findMany({
      where:  { companyId: company.id },
      select: { fileUrl: true },
    });

    await prisma.company.delete({ where: { id: company.id } });

    documents.forEach((d) => {
      fs.unlink(path.join(mediaCtrl.MEDIA_DIR, path.basename(d.fileUrl)), () => {});
    });

    res.json({ message: 'Company deleted' });
  } catch (err) {
    console.error('deleteCompany error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getCompanies, getFacets, getCompany,
  createCompany, updateCompany, deleteCompany,
};
