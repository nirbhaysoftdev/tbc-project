// src/lib/roles.ts
//
// One place that answers "does this role count as an admin?".
//
// SUPER_ADMIN is a strict superset of ADMIN: it can do everything an admin can
// and more. That makes a bare `role === 'ADMIN'` the wrong test — it reads as
// "is an admin" but means "is exactly an ADMIN", so a super admin would land in
// the member branch and lose the New Project button, the admin sidebar entry
// and the whole panel.
//
// The backend has the same two functions in backend/src/utils/roles.js. Keep
// them in step: the UI deciding what to show and the API deciding what to allow
// have to agree, or a super admin gets buttons that 403 — or worse, loses
// buttons for things they are allowed to do.

export type Role = 'MEMBER' | 'ADMIN' | 'SUPER_ADMIN';

/** True for ADMIN and SUPER_ADMIN. The test to use for "may do admin things". */
export const isAdminRole = (role?: string | null): boolean =>
  role === 'ADMIN' || role === 'SUPER_ADMIN';

/**
 * True only for SUPER_ADMIN.
 *
 * Use this to gate the controls an admin must not see: delete and purge,
 * membership rejection, freeze, email and password changes, wallet opening
 * balances, withdrawal decisions, enquiry recipients, data export. Hiding them
 * matters — an admin who can see a Delete button that always fails has been
 * given a bug report to file, not a permission boundary to understand.
 */
export const isSuperAdminRole = (role?: string | null): boolean =>
  role === 'SUPER_ADMIN';
