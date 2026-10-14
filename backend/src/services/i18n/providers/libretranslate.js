// src/services/i18n/providers/libretranslate.js
//
// LibreTranslate — the free, self-hostable option, and the recommended way to
// get real translations on this project without a paid account.
//
// Run it next to the API with no API key and no billing relationship:
//
//   docker run -d --name libretranslate -p 5050:5000 \
//     libretranslate/libretranslate --load-only en,it,ru,fa,ar
//
//   TRANSLATION_PROVIDER=libretranslate
//   LIBRETRANSLATE_URL=http://localhost:5050
//
// Quality is below Google's or DeepL's, and `fa` support in particular is
// weaker. That is the trade-off for zero marginal cost, and English remains the
// authoritative copy either way.
//
// Public community instances exist but are rate-limited and not suitable for a
// production workload; point LIBRETRANSLATE_URL at your own container.

const { TranslationError, isRetryableStatus, fetchWithTimeout } = require('./base');

const BASE_URL = (process.env.LIBRETRANSLATE_URL || 'http://localhost:5050').replace(/\/+$/, '');
const API_KEY = process.env.LIBRETRANSLATE_API_KEY || '';
const TIMEOUT = Number(process.env.TRANSLATION_TIMEOUT_MS || 20000);

module.exports = {
  name: 'libretranslate',
  model: null,

  async translateBatch(texts, targetLanguage) {
    if (!Array.isArray(texts) || !texts.length) return [];

    // LibreTranslate accepts an array for `q` and returns an array in the same
    // order, so one request covers the whole batch.
    const body = {
      q: texts,
      source: 'en',
      target: targetLanguage,
      // Always 'text': html.js has already stripped the markup out, so the
      // provider only ever sees prose. Asking for 'html' here would be asking
      // it to re-interpret text that is no longer markup.
      format: 'text',
    };
    if (API_KEY) body.api_key = API_KEY;

    const res = await fetchWithTimeout(
      `${BASE_URL}/translate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      TIMEOUT,
    );

    if (!res.ok) {
      // The body often carries a usable reason ("Invalid target language").
      let detail = '';
      try {
        const payload = await res.json();
        detail = payload?.error ? ` — ${payload.error}` : '';
      } catch { /* non-JSON error body */ }
      throw new TranslationError(`LibreTranslate HTTP ${res.status}${detail}`, {
        retryable: isRetryableStatus(res.status),
        status: res.status,
        provider: 'libretranslate',
      });
    }

    const data = await res.json();
    const out = data?.translatedText;

    // A single-element array comes back as a bare string on some versions.
    const list = Array.isArray(out) ? out : [out];
    if (list.length !== texts.length) {
      throw new TranslationError(
        `LibreTranslate returned ${list.length} results for ${texts.length} inputs`,
        { retryable: false, provider: 'libretranslate' },
      );
    }
    return list.map((v) => String(v ?? ''));
  },
};
