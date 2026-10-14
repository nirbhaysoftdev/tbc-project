// src/middleware/language.js
//
// Resolves the language for every API request and hangs it on `req.language`.
//
// Mounted once, globally, before the routes. Controllers read `req.language`
// and never parse a header themselves, so there is one allowlist check and one
// precedence order in the whole backend (requirement §8).
//
// Precedence, strongest first:
//
//   1  ?lang=xx            explicit per-request override. Exists for links and
//                          for emails, where there is no header to rely on.
//   2  Accept-Language     what the API client actually sends. The frontend's
//                          axios interceptor sets it to the active UI language,
//                          so this is the normal path.
//   3  tbc_lang cookie     first-party, written by the frontend alongside
//                          localStorage. A safety net for a request that
//                          somehow carries no header.
//   4  English
//
// The authenticated user's stored `locale` is deliberately NOT consulted here.
// It is the frontend's job to apply a saved preference and then send the
// matching header; having the server silently override the header with a stale
// profile value would make the API disagree with the UI it is feeding.

const { DEFAULT_LANGUAGE, normalizeLanguage, parseAcceptLanguage, directionOf } = require('../services/i18n/languages');

function resolveRequestLanguage(req) {
  // 1 — query override
  const fromQuery = normalizeLanguage(req.query?.lang);
  if (fromQuery) return { language: fromQuery, source: 'query' };

  // 2 — Accept-Language, quality values honoured
  const fromHeader = parseAcceptLanguage(req.headers?.['accept-language']);
  if (fromHeader) return { language: fromHeader, source: 'header' };

  // 3 — first-party cookie. Parsed by hand because this app has no
  // cookie-parser middleware and adding one for a single two-letter value
  // would be a dependency for nothing.
  const cookieHeader = req.headers?.cookie;
  if (typeof cookieHeader === 'string') {
    const match = cookieHeader.match(/(?:^|;\s*)tbc_lang=([^;]+)/);
    const fromCookie = normalizeLanguage(match?.[1] && decodeURIComponent(match[1]));
    if (fromCookie) return { language: fromCookie, source: 'cookie' };
  }

  return { language: DEFAULT_LANGUAGE, source: 'default' };
}

function languageMiddleware(req, res, next) {
  const { language, source } = resolveRequestLanguage(req);

  req.language = language;
  req.languageSource = source;

  // Tells caches and clients that this response varies by language. Without
  // it, a proxy could serve an Italian body to a Russian request (§11
  // "ensure cached API responses respect language").
  res.setHeader('Content-Language', language);
  res.vary('Accept-Language');

  next();
}

module.exports = { languageMiddleware, resolveRequestLanguage, directionOf };
