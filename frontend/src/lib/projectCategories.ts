// src/lib/projectCategories.ts
//
// The categories a Deal Room project can be filed under. One list, used by the
// project form and by Add Investment, so an investment's category is always its
// project's category. Stored as the key; ProjectCard's prettyCategory() is the
// label. Projects created before this list keep whatever category they have.
export const PROJECT_CATEGORIES = [
  'TECHNOLOGY', 'OIL_GAS', 'FOOD_BEVERAGES', 'REAL_ESTATE', 'ENERGY',
  'HEALTHCARE', 'FINANCE', 'FASHION', 'MEDIA', 'SPORTS', 'CONSULTING',
  'CONSTRUCTION', 'EDUCATION', 'MANUFACTURING', 'HOSPITALITY', 'LOGISTICS',
  'AGRICULTURE', 'RETAIL', 'OTHER',
];
