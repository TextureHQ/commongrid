-- System actor for machine-made moderation decisions.
--
-- moderation_actions.moderator_id is NOT NULL and references users(id), but
-- auto-approval records its audit row with moderator_id = 'system'. No such
-- user existed, so every auto-approval raised a foreign key violation
-- (23503) *after* the contribution had already been flipped to
-- 'auto_approved' — leaving the contribution marked accepted, no audit row,
-- no contributor stats, and no change applied to the entity.
--
-- Confirmed in production: contribution 8f7c88e2-31e9-4860-8b50-d720508af76f
-- is 'auto_approved' with zero matching moderation_actions rows and an
-- unchanged entity.
--
-- clerk_user_id is NOT NULL UNIQUE and this account must never resolve to a
-- real Clerk session, so it gets a reserved sentinel value. lib/auth.ts looks
-- users up by clerk_user_id; 'system' is not a valid Clerk id format, so it
-- can never be matched by an incoming token.

-- role is 'contributor', not 'admin': the account never authenticates, and
-- moderator lookups select on role — app/api/v1/contributions/route.ts notifies
-- everyone with role IN ('moderator','admin') on each new contribution, which
-- would attempt a Knock notification to an account with no recipient. It also
-- keeps it out of moderator lists and approved_count rankings.
INSERT INTO users (id, clerk_user_id, display_name, role, created_at, updated_at)
VALUES ('system', 'system', 'CommonGrid', 'contributor', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
