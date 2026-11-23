// src/services/projectCategories.js
//
// The categories a Deal Room project, and so an investment, can be filed under.
// There is one list: an investment booked into a project takes that project's
// category, and capital booked with no project picks one of these directly.
// Stored as the key. frontend/src/lib/projectCategories.ts mirrors it - change
// both together.
const PROJECT_CATEGORIES = [
  'TECHNOLOGY', 'OIL_GAS', 'FOOD_BEVERAGES', 'REAL_ESTATE', 'ENERGY',
  'HEALTHCARE', 'FINANCE', 'FASHION', 'MEDIA', 'SPORTS', 'CONSULTING',
  'CONSTRUCTION', 'EDUCATION', 'MANUFACTURING', 'HOSPITALITY', 'LOGISTICS',
  'AGRICULTURE', 'RETAIL', 'OTHER',
];

/** '' / null -> null. An unknown key is a 400. */
function normalizeCategory(value) {
  if (value == null || String(value).trim() === '') return null;
  const key = String(value).trim().toUpperCase();
  if (!PROJECT_CATEGORIES.includes(key)) {
    throw Object.assign(new Error('Unknown category'), { status: 400 });
  }
  return key;
}

const LABELS = { OIL_GAS: 'Oil & Gas', FOOD_BEVERAGES: 'Food & Beverages' };
const categoryLabel = (key) => !key ? null : LABELS[key]
  || String(key).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

module.exports = { PROJECT_CATEGORIES, normalizeCategory, categoryLabel };
