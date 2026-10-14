// src/services/contactPrivacy.js
//
// What a member may learn about how to contact a project or a company.
//
// Members reach a project or company through Connect Now / Enquire Now
// (enquiryController.js), not through a published address. So these fields are
// stored for administration and stripped from every member-facing payload:
//
//   Company.contactEmail   an address a member would otherwise copy
//   Company.contactPhone   likewise
//   Project.contact        free-text contact block, typically a name + address
//
// The enquiry recipient is not listed because it is no longer stored on either
// model — it is one portal-wide setting (services/enquirySettings.js) and
// never appears in a project or company payload at all.
//
// `contactPerson` and `websiteUrl` survive. A name is not a way to contact
// somebody, and a public website is already public — the point of this module
// is that nothing here hands a member a private address to write to or a
// number to ring.
//
// This is the same deny-by-default thinking as memberVisibility.js, applied to
// the organisation rather than the person. It is applied on the way OUT, in
// one place, because the alternative is remembering to omit five columns from
// every `select` in two controllers, and the leak that follows from forgetting
// once is silent.

/** Fields never serialised to a member, per entity type. */
const PRIVATE_FIELDS = {
  PROJECT: ['contact'],
  COMPANY: ['contactEmail', 'contactPhone'],
};

/**
 * Remove the private contact fields from one row.
 *
 * Admins are returned the row untouched: they configure these values, and they
 * read them through the same endpoints the admin UI already uses.
 *
 * Returns a new object rather than mutating, so a caller that still needs the
 * full row (to resolve a recipient, say) is not quietly robbed of it.
 */
function stripPrivateContact(row, { kind, isAdmin }) {
  if (!row) return row;
  if (isAdmin) return row;

  const fields = PRIVATE_FIELDS[kind];
  if (!fields) throw new Error(`stripPrivateContact: unknown kind "${kind}"`);

  const out = { ...row };
  // Deleted, not set to null: a null `contactEmail` in a payload still tells a
  // reader the field exists, and the frontend would render an empty row for
  // it. Absent means absent.
  fields.forEach((field) => { delete out[field]; });
  return out;
}

/** The same, for a list. */
function stripPrivateContactMany(rows, options) {
  if (!Array.isArray(rows)) return rows;
  if (options.isAdmin) return rows;
  return rows.map((row) => stripPrivateContact(row, options));
}

module.exports = { stripPrivateContact, stripPrivateContactMany, PRIVATE_FIELDS };
