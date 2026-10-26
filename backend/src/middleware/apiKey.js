// src/middleware/apiKey.js
//
// The gate for machine callers, and the one that lets a route serve both a
// logged-in admin and a server-to-server consumer.
//
// `machineOrAdmin(scope)` decides by what arrived:
//
//   X-API-Key: tbc_live_...        -> the key is verified and must hold `scope`
//   Authorization: Bearer tbc_...  -> same (a key, not a session token)
//   Authorization: Bearer <jwt>    -> the existing authenticate + requireAdmin
//   nothing                        -> 401
//
// A key is NEVER accepted from the query string. URLs end up in access logs,
// browser history and `Referer` headers - the same reason the media streams
// carry a short-lived ticket instead of the session token (see
// controllers/projectMediaController.js).
const { authenticate, requireAdmin } = require('./auth');
const apiKeys = require('../services/apiKeys');

/** The presented key, from either header. Null when the caller is not a machine. */
function presentedKey(req) {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();

  // `Bearer tbc_live_...` is a key; `Bearer eyJ...` is a session token.
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token.startsWith(apiKeys.PREFIX)) return token;
  }
  return null;
}

/** The admin session path: exactly the two gates every other admin route uses. */
const asAdmin = (req, res, next) => authenticate(req, res, (err) => (
  err ? next(err) : requireAdmin(req, res, next)
));

/**
 * @param {string|string[]} scope the scope a machine caller must hold for this
 *   route; a list means any one of them is enough (reading the counts is
 *   satisfied by either `events:counts` or the broader `events:read`).
 *
 *   An admin session is not scoped - a human admin already has the rights
 *   these scopes carve up, and scoping their session would just be a second
 *   permission system over the same data.
 */
const machineOrAdmin = (scope) => async (req, res, next) => {
  const accepted = Array.isArray(scope) ? scope : [scope];
  const presented = presentedKey(req);
  if (!presented) {
    // A key in the query string is refused loudly rather than ignored, so a
    // consumer that tries it finds out now instead of shipping it.
    if (req.query.api_key || req.query.apiKey) {
      return res.status(400).json({
        error: 'Send the key in the X-API-Key header. A key in the URL leaks through logs and referrers.',
      });
    }
    return asAdmin(req, res, next);
  }

  try {
    const result = await apiKeys.verify(presented);
    if (!result.ok) {
      // One message for every failure mode. "Expired" and "revoked" are useful
      // to the owner of a key and useful to someone probing with a stolen one,
      // so the detail goes in the server log, not the response.
      console.warn(`apiKey rejected (${result.reason})`);
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!accepted.some((s) => apiKeys.hasScope(result.key, s))) {
      return res.status(403).json({
        error: accepted.length === 1
          ? `This key does not have the "${accepted[0]}" scope.`
          : `This key needs one of these scopes: ${accepted.join(', ')}.`,
        scopes: result.key.scopes,
      });
    }

    req.apiKey = result.key;
    // What the payload redaction keys off. Deny by default: no scope, no
    // identifying detail.
    req.sensitive = apiKeys.hasScope(result.key, 'events:sensitive');
    apiKeys.touch(result.key, req.ip);
    return next();
  } catch (err) {
    console.error('machineOrAdmin error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * True when the current request may see identifying detail: any admin session,
 * or a key holding `events:sensitive`.
 */
const maySeeSensitive = (req) => (req.apiKey ? Boolean(req.sensitive) : true);

module.exports = { machineOrAdmin, presentedKey, maySeeSensitive };
