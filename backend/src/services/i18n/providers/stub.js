// src/services/i18n/providers/stub.js
//
// The DEFAULT provider, and the reason this system costs nothing to run.
//
// It makes no network call and returns the English source unchanged. The
// pipeline around it is fully live: jobs are queued, claimed, versioned,
// stored, retried and served, and the API falls back to English exactly as it
// would while a real provider was catching up. Switching to a real provider is
// one environment variable (TRANSLATION_PROVIDER) — no code change, no
// migration, no frontend change.
//
// It reports its results as FAILED-equivalent rather than MACHINE-translated:
// see `passthrough`. Storing an English string and labelling it a Persian
// translation would be a lie that the outdated-detection logic would then
// happily keep fresh, and no "machine translated" badge would ever clear.
// Instead nothing is stored, the API serves English, and the content is
// correctly reported as untranslated.

const { TranslationError } = require('./base');

module.exports = {
  name: 'stub',
  model: 'passthrough',

  /**
   * Signals to the worker that no translation was actually produced, so the
   * result must not be written to the translations table.
   */
  passthrough: true,

  async translateBatch(texts, targetLanguage) {
    if (!Array.isArray(texts)) {
      throw new TranslationError('translateBatch expects an array', { retryable: false });
    }
    // Returned for shape-compatibility only; the worker discards these because
    // of `passthrough` above.
    return texts.map((t) => String(t ?? ''));
  },
};
