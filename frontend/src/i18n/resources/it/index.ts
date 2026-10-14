// src/i18n/resources/it/index.ts
//
// Lazily imported as one chunk by loadLanguage() in src/i18n/index.ts.
// Any key missing here falls back to the English bundle, so a partial
// translation is a safe, intentional state rather than a broken screen.

import common from './common.json';
import validation from './validation.json';
import nav from './nav.json';
import auth from './auth.json';
import dashboard from './dashboard.json';
import community from './community.json';
import admin from './admin.json';
import landing from './landing.json';

const it = { common, validation, nav, auth, dashboard, community, admin, landing };

export default it;
