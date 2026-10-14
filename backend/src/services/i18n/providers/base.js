// src/services/i18n/providers/base.js
//
// The provider contract. Everything the rest of the system knows about machine
// translation is these three members, which is what lets the provider be
// swapped by changing one environment variable and nothing else (§6.B).
//
//   name            identifier stored on each translation row for traceability
//   model           optional provider model/version, also stored
//   translateBatch(texts, targetLanguage, format) -> string[]
//                   same length, same order as `texts`. English is always the
//                   source language, so it is not a parameter.
//
// A provider throws on failure. The two kinds matter:
//
//   err.retryable === true   transient — network, 429, 5xx, timeout. The worker
//                            backs off and tries again.
//   err.retryable === false  permanent — bad credentials, unsupported language,
//                            payload too large. The worker marks the job DEAD
//                            immediately rather than burning five attempts.

class TranslationError extends Error {
  constructor(message, { retryable = true, status = null, provider = null } = {}) {
    super(message);
    this.name = 'TranslationError';
    this.retryable = retryable;
    this.status = status;
    this.provider = provider;
  }
}

/**
 * HTTP status → retryable. 408/425/429 and all 5xx are worth another attempt;
 * 4xx otherwise means the request itself is wrong and will stay wrong.
 */
function isRetryableStatus(status) {
  if (!Number.isFinite(status)) return true; // network-level failure
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500;
}

/**
 * fetch with a hard timeout.
 *
 * A translation provider that stops answering must not hold a worker slot
 * open indefinitely — requirement §11 asks for explicit timeouts.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new TranslationError(`Provider timed out after ${timeoutMs}ms`, { retryable: true });
    }
    throw new TranslationError(`Provider request failed: ${err.message}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { TranslationError, isRetryableStatus, fetchWithTimeout };
