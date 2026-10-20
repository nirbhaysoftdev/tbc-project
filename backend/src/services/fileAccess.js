// src/services/fileAccess.js
//
// Uploads are NOT safe to serve statically. Identity documents (passport,
// resident ID, trade licence, CV) and KYC scans sit in the same directories as
// profile photos — the admin "Add Member" flow writes documents straight into
// uploads/ next to avatars — so a path or extension tells you nothing about how
// sensitive a file is. The database is the only authority: a file is private if
// some profile document field or KYC row points at it.
//
// Anything not referenced by the database at all is treated as unknown and
// refused, which also stops orphaned files from being enumerated.
const path = require('path');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prismaClient');
const { isAdmin } = require('../utils/roles');

const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

// How long a signed document link stays valid. Long enough to click through
// and for the browser to fetch it, short enough that a leaked URL is useless.
const LINK_TTL_SECONDS = 300;

/**
 * Turn a request path into a safe absolute path inside uploads/, or null when
 * it escapes the root (../, encoded traversal, NUL bytes).
 */
function resolveUploadPath(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const abs = path.resolve(UPLOADS_ROOT, `.${path.posix.normalize(`/${decoded}`)}`);
  if (abs !== UPLOADS_ROOT && !abs.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return abs;
}

/**
 * Classify a stored URL (the `/uploads/...` form held in the database).
 *
 * @returns {Promise<{kind:'PUBLIC'|'MEMBER'|'DOC'|'UNKNOWN', ownerId?: string}>}
 *   PUBLIC   - profile photos ONLY. The single deliberate exception: avatars
 *              are <img> sources on every screen and are not documents.
 *   MEMBER   - content imagery (post, event and project covers). Not public,
 *              but readable by any active logged-in member, since this is
 *              material the community is meant to see.
 *   DOC      - an identity or KYC document: the owner or an admin, nobody else.
 *   UNKNOWN  - nothing in the database references it: refuse.
 */
async function classifyStoredUrl(storedUrl) {
  const [photoOwner, docOwner, kycDoc, postImage, eventImage, projectImage] = await Promise.all([
    prisma.user.findFirst({
      where:  { profilePhoto: storedUrl },
      select: { id: true },
    }),
    prisma.profile.findFirst({
      where: {
        OR: [
          { cvUrl:           storedUrl },
          { passportUrl:     storedUrl },
          { residentIdUrl:   storedUrl },
          { tradeLicenseUrl: storedUrl },
        ],
      },
      select: { userId: true },
    }),
    prisma.kycDocument.findFirst({
      where:  { documentUrl: storedUrl },
      select: { userId: true },
    }),
    prisma.post.findFirst({    where: { imageUrl: storedUrl }, select: { id: true } }),
    prisma.event.findFirst({   where: { imageUrl: storedUrl }, select: { id: true } }),
    prisma.project.findFirst({ where: { imageUrl: storedUrl }, select: { id: true } }),
  ]);

  // Document wins over photo: if a file is referenced as both, the stricter
  // classification is the safe one.
  if (docOwner) return { kind: 'DOC', ownerId: docOwner.userId };
  if (kycDoc)   return { kind: 'DOC', ownerId: kycDoc.userId };

  // Content imagery: secured, but any member may see it.
  if (postImage || eventImage || projectImage) return { kind: 'MEMBER' };

  // The one public exception.
  if (photoOwner) return { kind: 'PUBLIC', ownerId: photoOwner.id };
  return { kind: 'UNKNOWN' };
}

/** May `user` read a document owned by `ownerId`? Admins and the owner only. */
function canReadDoc(user, ownerId) {
  if (!user) return false;
  return isAdmin(user.role) || user.id === ownerId;
}

/**
 * May `user` read MEMBER-level content imagery? Any logged-in account that is
 * not frozen or rejected - the same bar as the rest of the member API.
 */
function canReadMemberFile(user) {
  if (!user) return false;
  return user.status !== 'FROZEN' && user.status !== 'REJECTED';
}

/**
 * Mint a short-lived token for one exact path. Scoped to a single file and a
 * single user so it cannot be reused for anything else.
 */
function signFileToken(storedUrl, userId) {
  return jwt.sign(
    { fp: storedUrl, sub: userId, scope: 'file' },
    process.env.JWT_SECRET,
    { expiresIn: LINK_TTL_SECONDS },
  );
}

/** Verify a token minted by signFileToken for this exact path. */
function verifyFileToken(token, storedUrl) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.scope !== 'file') return null;
    if (payload.fp !== storedUrl) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  UPLOADS_ROOT,
  LINK_TTL_SECONDS,
  resolveUploadPath,
  classifyStoredUrl,
  canReadDoc,
  canReadMemberFile,
  signFileToken,
  verifyFileToken,
};
