// src/services/secretBox.js
//
// Encrypts a secret before it is stored in the database (AES-256-GCM), so a
// dump of the table cannot be used to call the service the secret belongs to.
//
// The key is ZOHO_ENCRYPTION_KEY (any long random string; it is hashed to 32
// bytes). Without it the key is derived from JWT_SECRET, which works but ties
// the stored secrets to that value: if JWT_SECRET ever changes, they can no
// longer be decrypted and have to be entered again. Set the dedicated variable
// once and never change it.
const crypto = require('crypto');

const keyBytes = () => {
  const material = process.env.ZOHO_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!material) throw new Error('Set ZOHO_ENCRYPTION_KEY (or JWT_SECRET) to store credentials');
  return crypto.createHash('sha256').update(`tbc-secret-box:${material}`).digest();
};

/** -> "v1:<iv>:<tag>:<ciphertext>" (base64 parts) */
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** Returns null (never throws) when the value is missing or cannot be read. */
function decrypt(boxed) {
  if (!boxed || typeof boxed !== 'string') return null;
  try {
    const [v, iv, tag, data] = boxed.split(':');
    if (v !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
