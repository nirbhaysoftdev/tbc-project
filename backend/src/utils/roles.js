// src/utils/roles.js
//
// One place that answers "does this role count as an admin?".
//
// SUPER_ADMIN is a strict superset of ADMIN: it can do everything an admin can
// and more. That makes `role === 'ADMIN'` the wrong test everywhere — it reads
// as "is an admin" but means "is exactly an ADMIN", and a super admin would
// silently fall into the member branch: seeing only ACTIVE projects, being
// refused another member's KYC document, losing the widened member profile.
//
// Use `isAdmin(role)` for permission checks and `isSuperAdmin(role)` only where
// the extra tier genuinely matters. The middleware gates (requireAdmin,
// requireSuperAdmin) are built on these same two functions.

/** True for ADMIN and SUPER_ADMIN. The test to use for "may do admin things". */
const isAdmin = (role) => role === 'ADMIN' || role === 'SUPER_ADMIN';

/** True only for SUPER_ADMIN. */
const isSuperAdmin = (role) => role === 'SUPER_ADMIN';

/** Every role that passes `isAdmin`, for use in a Prisma `role: { in: [...] }`. */
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

/**
 * The filter every member-facing user query needs, so a soft-deleted member
 * stops appearing in directories, searches, attendee lists and counts.
 * Spread it into a `where`: `{ ...LIVE_USER, role: 'MEMBER' }`.
 */
const LIVE_USER = { deletedAt: null };

module.exports = { isAdmin, isSuperAdmin, ADMIN_ROLES, LIVE_USER };
