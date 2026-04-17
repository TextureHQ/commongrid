import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Users — Application-Level User Profiles
 *
 * Maps Clerk-managed auth identities to CommonGrid roles, profiles, and
 * contribution stats. One row per Clerk user, created on first login via
 * the `user.created` Clerk webhook.
 *
 * Users are never hard-deleted — on Clerk `user.deleted`, we set
 * `banned_at = now()` with `ban_reason = 'account_deleted'` to preserve
 * contribution history for audit. All user-referencing FKs use SET NULL.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    /** External Clerk user ID — e.g., 'user_2abc...' */
    clerkUserId: text("clerk_user_id").notNull().unique(),

    // Profile (synced from Clerk webhooks on user.created / user.updated)
    displayName: text("display_name").notNull(),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    /** e.g., 'NREL', 'Pacific Gas & Electric' */
    affiliation: text("affiliation"),
    bio: text("bio"),

    // Authorization
    /** 'contributor' | 'trusted_contributor' | 'moderator' | 'admin' */
    role: text("role").notNull().default("contributor"),

    // Contribution Stats (denormalized for dashboard performance)
    contributionCount: integer("contribution_count").notNull().default(0),
    approvedCount: integer("approved_count").notNull().default(0),
    returnedCount: integer("returned_count").notNull().default(0),
    entityTypesEdited: text("entity_types_edited").array().notNull().default([]),
    /**
     * Per-entity-type contribution breakdown.
     * e.g., { "utility": { "total": 15, "approved": 12 }, ... }
     */
    contributionStatsByType: jsonb("contribution_stats_by_type").notNull().default({}),

    // Trusted Contributor tracking
    trustedPromotedAt: timestamp("trusted_promoted_at", { withTimezone: true }),
    /** User ID of the moderator who granted trusted status */
    trustedPromotedBy: text("trusted_promoted_by"),

    // Moderation
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    /** NULL = permanent ban */
    bannedUntil: timestamp("banned_until", { withTimezone: true }),
    banReason: text("ban_reason"),
    warningCount: integer("warning_count").notNull().default(0),

    // Moderator preferences (relevant only when role = 'moderator' | 'admin')
    modPreferredEntityTypes: text("mod_preferred_entity_types").array(),
    modPreferredRegions: text("mod_preferred_regions").array(),
    /** Internal note — visible only to mods/admins */
    modNotes: text("mod_notes"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_users_clerk_id").on(table.clerkUserId),
    index("idx_users_role").on(table.role),
    index("idx_users_created").on(table.createdAt),
    // Partial index for banned users — defined in migration DDL:
    // CREATE INDEX idx_users_banned ON users(banned_at) WHERE banned_at IS NOT NULL;
  ]
);

export type UserSelect = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
