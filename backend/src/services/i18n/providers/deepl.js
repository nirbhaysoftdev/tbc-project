// src/services/i18n/providers/deepl.js
//
// DeepL. PAID, though the Free tier allows 500 000 characters a month on a
// separate host. Set explicitly or not at all:
//
//   TRANSLATION_PROVIDER=deepl
//   DEEPL_API_KEY=<key>
//   DEEPL_API_URL=https://api-free.deepl.com/v2/translate   # Free tier
//   # or https://api.deepl.com/v2/translate                 # Pro
//
// IMPORTANT LIMITATION: DeepL does not support Persian (fa). A `fa` job sent
// here fails permanently rather than silently producing something else, so if
// you choose DeepL, Persian content stays English. That is checked up front
// below instead of being discovered as a confusing provider error.

const { TranslationError, isRetryableStatus, fetchWithTimeout } = require('./base');

const TIMEOUT = Number(process.env.TRANSLATION_TIMEOUT_MS || 20000);

// DeepL's own target codes differ from plain ISO 639-1 for some languages.
const TARGET_CODES = { it: 'IT', ru: 'RU', ar: 'AR' };

module.exports = {
  name: 'deepl',
  model: 'v2',

  async translateBatch(texts, targetLanguage) {
    if (!Array.isArray(texts) || !texts.length) return [];

    const key = process.env.DEEPL_API_KEY;
    if (!key) {
      throw new TranslationError('DEEPL_API_KEY is not set', {
        retryable: false,
        provider: 'deepl',
      });
    }

    const target = TARGET_CODES[targetLanguage];
    if (!target) {
      throw new TranslationError(
        `DeepL does not support "${targetLanguage}" — use a different provider for this language`,
        { retryable: false, provider: 'deepl' },
      );
    }

    const url = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';
    const params = new URLSearchParams();
    params.set('source_lang', 'EN');
    params.set('target_lang', target);
    texts.forEach((t) => params.append('text', String(t ?? '')));

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
      TIMEOUT,
    );

    if (!res.ok) {
      throw new TranslationError(`DeepL HTTP ${res.status}`, {
        retryable: isRetryableStatus(res.status),
        status: res.status,
        provider: 'deepl',
      });
    }

    const data = await res.json();
    const list = data?.translations;
    if (!Array.isArray(list) || list.length !== texts.length) {
      throw new TranslationError('DeepL returned an unexpected payload', {
        retryable: false,
        provider: 'deepl',
      });
    }
    return list.map((t) => String(t?.text ?? ''));
  },
};
