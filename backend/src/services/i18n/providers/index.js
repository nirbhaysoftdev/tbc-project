// src/services/i18n/providers/index.js
//
// Provider selection. One environment variable decides, and an unknown or
// unset value falls back to the stub — so the system always starts, never
// requires a paid account, and never silently picks something that bills.

const stub = require('./stub');
const libretranslate = require('./libretranslate');
const google = require('./google');
const deepl = require('./deepl');

const PROVIDERS = {
  stub,
  none: stub,          // alias: reads better in a .env file
  libretranslate,
  libre: libretranslate,
  google,
  deepl,
};

let cached = null;

function getProvider() {
  if (cached) return cached;

  const requested = (process.env.TRANSLATION_PROVIDER || 'stub').trim().toLowerCase();
  const provider = PROVIDERS[requested];

  if (!provider) {
    console.warn(
      `[i18n] unknown TRANSLATION_PROVIDER "${requested}" — falling back to the stub provider. ` +
        `Valid values: ${Object.keys(PROVIDERS).join(', ')}`,
    );
    cached = stub;
    return cached;
  }

  cached = provider;
  return cached;
}

/** Test seam: forget the memoised choice after changing process.env. */
function resetProvider() {
  cached = null;
}

module.exports = { getProvider, resetProvider, PROVIDERS };
