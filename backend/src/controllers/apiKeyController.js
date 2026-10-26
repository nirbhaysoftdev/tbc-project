// src/controllers/apiKeyController.js
//
// Managing machine credentials: issue, list, rename/re-scope, rotate, revoke.
//
// SUPER ADMIN ONLY, enforced on the route. The reasoning is the same as for
// the signup recipient list: a key is a standing grant to read member data
// without a session, so an ADMIN who could mint one could read everything the
// feed holds from outside the portal, unobserved. Every action here is written
// to the activity log for that reason.
//
// THE KEY IS SHOWN ONCE. `create` and `rotate` return `key` in their response
// and no other endpoint can ever produce it again - the database holds only a
// SHA-256 digest. If it is lost, rotate; there is nothing to recover.
const apiKeys = require('../services/apiKeys');
const { logActivity } = require('../services/activityLog');

/** GET /api/super-admin/api-keys */
const listKeys = async (req, res) => {
  try {
    const keys = await apiKeys.listApiKeys({
      includeRevoked: req.query.includeRevoked !== 'false',
    });
    res.json({
      keys,
      // The catalogue, so the panel builds its checkboxes from the server's
      // list rather than a copy that drifts.
      scopes: Object.entries(apiKeys.SCOPES).map(([scope, description]) => ({ scope, description })),
      defaultTtlDays: apiKeys.DEFAULT_TTL_DAYS,
    });
  } catch (err) {
    console.error('listKeys error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/super-admin/api-keys
 * Body: { name, scopes: string[], expiresInDays?: number|null }
 */
const createKey = async (req, res) => {
  try {
    const { key, apiKey } = await apiKeys.createApiKey({
      name:          req.body.name,
      scopes:        req.body.scopes,
      expiresInDays: req.body.expiresInDays,
      createdById:   req.user.id,
    });

    logActivity({
      type:        'API_KEY_CREATED',
      title:       `API key issued: ${apiKey.name}`,
      description: `${apiKey.keyPrefix}… · ${apiKey.scopes.join(', ')}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      // The prefix identifies the key; the key itself is never logged, which
      // would put a live credential in a table the whole admin team can read.
      metadata:    { apiKeyId: apiKey.id, keyPrefix: apiKey.keyPrefix, scopes: apiKey.scopes, expiresAt: apiKey.expiresAt },
    });

    res.status(201).json({
      apiKey,
      key,
      warning: 'This is the only time the key is shown. Store it now; it cannot be recovered, only rotated.',
    });
  } catch (err) {
    if (err.invalid) {
      return res.status(400).json({
        error: err.invalid.length
          ? `Unknown scope: ${err.invalid.join(', ')}`
          : 'At least one scope is required.',
        scopes: apiKeys.SCOPE_NAMES,
      });
    }
    if (err.field) return res.status(400).json({ error: err.message });
    console.error('createKey error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/** PUT /api/super-admin/api-keys/:id - name, scopes and expiry. Never the secret. */
const updateKey = async (req, res) => {
  try {
    const apiKey = await apiKeys.updateApiKey(req.params.id, {
      name:          req.body.name,
      scopes:        req.body.scopes,
      expiresInDays: req.body.expiresInDays,
      expiresAt:     req.body.expiresAt,
    });
    if (!apiKey) return res.status(404).json({ error: 'API key not found' });

    logActivity({
      type:        'API_KEY_UPDATED',
      title:       `API key changed: ${apiKey.name}`,
      description: `${apiKey.keyPrefix}… · ${apiKey.scopes.join(', ')}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      metadata:    { apiKeyId: apiKey.id, keyPrefix: apiKey.keyPrefix, scopes: apiKey.scopes, expiresAt: apiKey.expiresAt },
    });

    res.json({ apiKey });
  } catch (err) {
    if (err.invalid) {
      return res.status(400).json({
        error: err.invalid.length
          ? `Unknown scope: ${err.invalid.join(', ')}`
          : 'At least one scope is required.',
        scopes: apiKeys.SCOPE_NAMES,
      });
    }
    if (err.field) return res.status(400).json({ error: err.message });
    console.error('updateKey error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * POST /api/super-admin/api-keys/:id/rotate
 *
 * Issues a replacement with the same name and scopes and leaves the old key
 * WORKING. That is what makes rotation safe: the consumer deploys the new key,
 * you watch `lastUsedAt` on the old one stop moving, then you revoke it.
 * Revoking first is an outage.
 */
const rotateKey = async (req, res) => {
  try {
    const result = await apiKeys.rotateApiKey(req.params.id, { createdById: req.user.id });
    if (!result) return res.status(404).json({ error: 'API key not found' });

    logActivity({
      type:        'API_KEY_ROTATED',
      title:       `API key rotated: ${result.apiKey.name}`,
      description: `${result.replaced.keyPrefix}… replaced by ${result.apiKey.keyPrefix}… (the old key still works until revoked)`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      metadata:    {
        apiKeyId: result.apiKey.id, keyPrefix: result.apiKey.keyPrefix,
        replacedId: result.replaced.id, replacedPrefix: result.replaced.keyPrefix,
      },
    });

    res.status(201).json({
      apiKey:  result.apiKey,
      key:     result.key,
      replaced: result.replaced,
      warning: 'This is the only time the new key is shown. The previous key keeps working until you revoke it - revoke it once the consumer has switched.',
    });
  } catch (err) {
    console.error('rotateKey error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * DELETE /api/super-admin/api-keys/:id
 *
 * Revokes, which takes effect on the next request the key makes. The row stays:
 * it is the record of what this key could reach and when it stopped working.
 */
const revokeKey = async (req, res) => {
  try {
    const apiKey = await apiKeys.revokeApiKey(req.params.id, { revokedById: req.user.id });
    if (!apiKey) return res.status(404).json({ error: 'API key not found' });

    logActivity({
      type:        'API_KEY_REVOKED',
      title:       `API key revoked: ${apiKey.name}`,
      description: `${apiKey.keyPrefix}… · last used ${apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : 'never'}`,
      actorId:     req.user.id,
      actorName:   req.user.name,
      metadata:    { apiKeyId: apiKey.id, keyPrefix: apiKey.keyPrefix, lastUsedAt: apiKey.lastUsedAt },
    });

    res.json({ apiKey, message: 'Revoked. The key stops working on its next request.' });
  } catch (err) {
    console.error('revokeKey error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { listKeys, createKey, updateKey, rotateKey, revokeKey };
