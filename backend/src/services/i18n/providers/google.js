// src/services/i18n/providers/google.js
//
// Google Cloud Translation v2. PAID — billed per character, with a free monthly
// character allowance that a small content set may stay inside. Nothing here
// runs unless TRANSLATION_PROVIDER=google is set explicitly, so the project
// cannot start incurring charges by accident.
//
//   TRANSLATION_PROVIDER=google
//   GOOGLE_TRANSLATE_API_KEY=<key>   # restrict it to the Translation API
//
// The v2 REST endpoint is used rather than @google-cloud/translate so no
// dependency and no service-account JSON is needed. The key never leaves the
// server: the frontend has no idea which provider is configured (§13).

const { TranslationError, isRetryableStatus, fetchWithTimeout } = require('./base');

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
const TIMEOUT = Number(process.env.TRANSLATION_TIMEOUT_MS || 20000);

module.exports = {
  name: 'google',
  model: 'translate-v2',

  async translateBatch(texts, targetLanguage) {
    if (!Array.isArray(texts) || !texts.length) return [];

    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!key) {
      // Permanent: retrying a missing credential five times helps nobody.
      throw new TranslationError('GOOGLE_TRANSLATE_API_KEY is not set', {
        retryable: false,
        provider: 'google',
      });
    }

    const params = new URLSearchParams();
    params.set('key', key);
    params.set('source', 'en');
    params.set('target', targetLanguage);
    // 'text' because html.js has already extracted the prose out of any
    // markup; the structure never reaches the provider.
    params.set('format', 'text');
    // `q` repeats once per string; Google preserves order in the response.
    texts.forEach((t) => params.append('q', String(t ?? '')));

    const res = await fetchWithTimeout(
      ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      },
      TIMEOUT,
    );

    if (!res.ok) {
      let detail = '';
      try {
        const payload = await res.json();
        detail = payload?.error?.message ? ` — ${payload.error.message}` : '';
      } catch { /* non-JSON error body */ }
      throw new TranslationError(`Google Translate HTTP ${res.status}${detail}`, {
        retryable: isRetryableStatus(res.status),
        status: res.status,
        provider: 'google',
      });
    }

    const data = await res.json();
    const list = data?.data?.translations;
    if (!Array.isArray(list) || list.length !== texts.length) {
      throw new TranslationError('Google Translate returned an unexpected payload', {
        retryable: false,
        provider: 'google',
      });
    }
    return list.map((t) => String(t?.translatedText ?? ''));
  },
};
