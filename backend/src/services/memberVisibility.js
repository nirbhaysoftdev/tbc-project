// src/services/memberVisibility.js
//
// What one member may learn about another.
//
// Nothing here is reachable without a login (every member route sits behind
// `authenticate`). This module governs the next question: what a logged-in
// member sees about SOMEONE ELSE.
//
// The rule is deny-by-default. A member sees a name and a photo. Everything
// else — identity documents, phone numbers, billing and business addresses,
// VAT number, email, KYC status, membership record — is never serialised to
// another member, so it cannot leak through an API response or a URL in one.
//
// Admins and the member themselves are unaffected: admins read full records
// through /api/admin/*, and a member reads their own through /api/auth/me.

// ── The one switch that matters ───────────────────────────────────────────────
// Professional directory fields the member typed about themselves for the
// Community directory: company, industry, country, city, bio, job title,
// LinkedIn, website.
//
// false = members see only name + photo (strictest).
// true  = members also see the professional fields above (networking UI intact).
//
// Identity documents, contact details and financial fields are NOT governed by
// this switch — they are never exposed either way.
const SHOW_PROFESSIONAL_FIELDS = true;

const PROFESSIONAL_PROFILE_SELECT = {
  company:   true,
  industry:  true,
  country:   true,
  city:      true,
  bio:       true,
  jobTitle:  true,
  linkedIn:  true,
  website:   true,
};

/** Profile fields another member may see, or null when none are allowed. */
function visibleProfileSelect() {
  return SHOW_PROFESSIONAL_FIELDS ? { select: PROFESSIONAL_PROFILE_SELECT } : null;
}

/**
 * The projection to use anywhere a user is embedded in someone else's payload:
 * post authors, comment authors, event attendees, project owners, investors,
 * message partners, the member directory.
 */
function memberCardSelect() {
  const select = { id: true, name: true, profilePhoto: true };
  const profile = visibleProfileSelect();
  if (profile) select.profile = profile;
  return select;
}

/**
 * Full projection for GET /api/community/members/:id.
 * `self` widens it for the member's own record; admins get everything.
 */
function memberProfileSelect({ isSelfOrAdmin }) {
  if (isSelfOrAdmin) {
    return {
      id: true, name: true, profilePhoto: true, kycStatus: true, createdAt: true,
      profile: true,
      membership: true,
      _count: { select: { posts: true, investments: true, projectsOwned: true } },
    };
  }

  const select = {
    id: true, name: true, profilePhoto: true,
    // Post count is the member's own public activity in the feed.
    _count: { select: { posts: true } },
  };
  const profile = visibleProfileSelect();
  if (profile) {
    select.profile = profile;
    select.createdAt = true;   // "member since" only makes sense alongside these
  }
  return select;
}

module.exports = {
  SHOW_PROFESSIONAL_FIELDS,
  memberCardSelect,
  memberProfileSelect,
  visibleProfileSelect,
};
