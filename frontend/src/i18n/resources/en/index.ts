// src/i18n/resources/en/index.ts
//
// English is the source of truth and the fallback, so it is the one language
// bundled statically — `fallbackLng` can only work if these resources are
// already in memory when i18next initialises. The other four languages are
// code-split; see src/i18n/index.ts.

import common from './common.json';
import validation from './validation.json';
import nav from './nav.json';
import auth from './auth.json';
import dashboard from './dashboard.json';
import community from './community.json';
import admin from './admin.json';
import landing from './landing.json';

const en = { common, validation, nav, auth, dashboard, community, admin, landing };

export default en;
