// src/services/i18n/translatable.js
//
// The registry of what may be translated. Adding a new translatable field is an
// entry here and nothing else — no migration, no new table, no route change.
//
// Each entry declares:
//   model   the Prisma delegate name, used only for orphan pruning
//   fields  field name → { format }
//             format 'text' — plain prose, translated as a string
//             format 'html' — markup, translated with structure preserved
//                             (see html.js)
//
// What is deliberately NOT here matters as much as what is:
//
//   * `category`, `status`, `type`, `riskLevel`, `shareType` — these are
//     enum-like identifiers that the frontend maps to its own translation keys.
//     Translating the stored value would break every equality check and filter
//     that compares against 'ACTIVE' or 'LIMITED'. Requirement §8 and §13.
//   * `imageUrl`, `fileUrl`, `linkedIn`, `website`, `email`, `iban`,
//     `reference`, `vatNumber` — URLs, addresses and codes. Not language.
//   * anything on User, Wallet, Transaction, WithdrawRequest, Message or
//     KycDocument — these are private or financial records. Member-to-member
//     messages and transaction descriptions are never sent to an external
//     translation provider (requirement §13).
//
// `Profile.bio` and `Profile.jobTitle` are included because they are already
// shown to other members through the directory projection in
// memberVisibility.js. Nothing is added here that that projection does not
// already expose.

const TRANSLATABLE = {
  Project: {
    model: 'project',
    fields: {
      title:            { format: 'text' },
      description:      { format: 'html' },
      primaryObjective: { format: 'text' },
      // The WYSIWYG body. 'html' so the markup survives translation with its
      // structure intact (see html.js) rather than being translated as a
      // string of tags.
      detailsHtml:      { format: 'html' },
    },
  },
  // Company profiles. `category`, `status`, `websiteUrl`, `contactEmail` and
  // `contactPhone` are deliberately absent for the reasons in the header:
  // identifiers, URLs and contact codes are not language. `locations` is a
  // scalar list the listing filters on by exact value, so translating it would
  // break the filter.
  Company: {
    model: 'company',
    fields: {
      name:          { format: 'text' },
      description:   { format: 'text' },
      detailsHtml:   { format: 'html' },
      contactPerson: { format: 'text' },
    },
  },
  Milestone: {
    model: 'milestone',
    fields: {
      title:       { format: 'text' },
      description: { format: 'text' },
    },
  },
  Event: {
    model: 'event',
    fields: {
      title:       { format: 'text' },
      description: { format: 'html' },
      location:    { format: 'text' },
    },
  },
  Post: {
    model: 'post',
    fields: {
      title:   { format: 'text' },
      content: { format: 'html' },
    },
  },
  Notification: {
    model: 'notification',
    fields: {
      title:   { format: 'text' },
      message: { format: 'text' },
    },
  },
  Profile: {
    model: 'profile',
    fields: {
      bio:      { format: 'text' },
      jobTitle: { format: 'text' },
    },
  },
};

const ENTITY_TYPES = Object.keys(TRANSLATABLE);

function isTranslatableEntity(entityType) {
  return Object.prototype.hasOwnProperty.call(TRANSLATABLE, entityType);
}

function isTranslatableField(entityType, field) {
  return (
    isTranslatableEntity(entityType) &&
    Object.prototype.hasOwnProperty.call(TRANSLATABLE[entityType].fields, field)
  );
}

function fieldsOf(entityType) {
  return isTranslatableEntity(entityType)
    ? Object.keys(TRANSLATABLE[entityType].fields)
    : [];
}

function formatOf(entityType, field) {
  return isTranslatableField(entityType, field)
    ? TRANSLATABLE[entityType].fields[field].format
    : 'text';
}

function modelOf(entityType) {
  return isTranslatableEntity(entityType) ? TRANSLATABLE[entityType].model : null;
}

module.exports = {
  TRANSLATABLE,
  ENTITY_TYPES,
  isTranslatableEntity,
  isTranslatableField,
  fieldsOf,
  formatOf,
  modelOf,
};
