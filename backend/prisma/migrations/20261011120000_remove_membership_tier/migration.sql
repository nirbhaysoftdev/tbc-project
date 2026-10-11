-- Remove membership tiers: every member is on the same tier.
ALTER TABLE "users" DROP COLUMN IF EXISTS "membershipTier";
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "tier";
DROP TYPE IF EXISTS "MembershipTier";
