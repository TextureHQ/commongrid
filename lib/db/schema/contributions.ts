import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { changesets } from "./changesets";
import { users } from "./users";

/**
 * Custom generic PostGIS GEOGRAPHY type.
 * Accepts any geometry subtype (Point, Polygon, MultiPolygon, etc.).
 *
 * SRID validation CHECK constraints — enforced in migration DDL:
 *   CONSTRAINT chk_geometry_before_srid CHECK (
 *     geometry_before IS NULL OR ST_SRID(geometry_before::geometry) = 4326
 *   )
 *   CONSTRAINT chk_geometry_after_srid CHECK (
 *     geometry_after IS NULL OR ST_SRID(geometry_after::geometry) = 4326
 *   )
 */
const geography = customType<{ data: string }>({
  dataType() {
    return "geography";
  },
});

/**
 * Contributions — Individual Edit Proposals
 *
 * The core community contributions table. Each row is a proposed edit to
 * one or more fields on a single entity. Contributions pass through a
 * moderation workflow before being applied to entity tables.
 *
 * Entity references (entity_type, entity_id) are validated by the
 * `validate_entity_reference()` trigger — see migration DDL §6.1.
 *
 * Geometry changes use native PostGIS GEOGRAPHY columns, not JSONB.
 * Spatial validation is handled by the `validate_territory_topology()`
 * trigger — see migration DDL §7.
 *
 * Optimistic concurrency: `entity_version` is reference-only (for diffs
 * and UI conflict warnings). Real concurrency control uses FOR UPDATE
 * row locking at approval time — see ERD §5.
 */
export const contributions = pgTable(
  "contributions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    /** FK to users; ON DELETE SET NULL — history preserved when user is deleted */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** FK to changesets; ON DELETE SET NULL */
    changesetId: text("changeset_id").references(() => changesets.id, {
      onDelete: "set null",
    }),

    // Target entity (polymorphic — validated by trigger, see migration DDL §6.1)
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Entity version at edit time — reference for diffs, NOT the concurrency lock */
    entityVersion: integer("entity_version").notNull(),

    // Denormalized entity metadata (cached at creation for fast moderation queue filtering)
    /** Cached slug for URL construction without JOINs */
    entitySlug: text("entity_slug").notNull(),
    /** Cached state code for geographic filtering; NULL for non-state entities */
    entityState: text("entity_state"),

    /**
     * Attribute changes — geometry excluded (see geometry columns below).
     * Format: { field_name: { old: value, new: value } }
     */
    changes: jsonb("changes").notNull(),

    // Geometry changes (native PostGIS GEOGRAPHY — NOT included in changes JSONB)
    /**
     * NULL for non-geometry edits.
     * 'point_moved' | 'polygon_edited' | 'polygon_created' | 'geometry_deleted'
     */
    geometryChangeType: text("geometry_change_type"),
    /** Snapshot of entity's current geometry at edit time */
    geometryBefore: geography("geometry_before"),
    /** Proposed new geometry */
    geometryAfter: geography("geometry_after"),
    /** Populated by validate_territory_topology() trigger — see migration DDL §7 */
    geometryValidation: jsonb("geometry_validation"),

    /** Required human-readable summary of the edit — minimum 25 characters */
    editSummary: text("edit_summary").notNull(),

    // Default source citation (per-field overrides stored in source_citations table)
    /**
     * 'eia_filing' | 'utility_website' | 'state_puc' | 'sec_filing'
     * | 'ferc_filing' | 'news_article' | 'academic_paper'
     * | 'government_db' | 'personal_observation' | 'other'
     */
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    sourceDate: date("source_date"),

    /**
     * Moderation status.
     * 'pending' | 'approved' | 'returned' | 'changes_requested'
     * | 'auto_approved' | 'version_conflict'
     */
    status: text("status").notNull().default("pending"),

    // Auto-moderation flags
    autoFlagged: boolean("auto_flagged").notNull().default(false),
    flagReasons: text("flag_reasons").array(),
    autoApproved: boolean("auto_approved").notNull().default(false),

    // Moderator response
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    moderatorComment: text("moderator_comment"),

    /** If approved, the resulting entity version number */
    appliedVersion: integer("applied_version"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_contributions_user").on(table.userId),
    index("idx_contributions_entity").on(table.entityType, table.entityId),
    index("idx_contributions_status").on(table.status),
    index("idx_contributions_changeset").on(table.changesetId),
    index("idx_contributions_created").on(table.createdAt),
    // Partial/composite indexes for moderation queue — defined in migration DDL:
    // CREATE INDEX idx_contributions_reviewed_by ON contributions(reviewed_by, reviewed_at DESC)
    //   WHERE reviewed_by IS NOT NULL;
    // CREATE INDEX idx_contributions_pending ON contributions(status, created_at)
    //   WHERE status = 'pending';
    // CREATE INDEX idx_contributions_queue ON contributions(status, entity_type, auto_flagged, created_at DESC)
    //   WHERE status IN ('pending', 'changes_requested');
    // CREATE INDEX idx_contributions_flagged ON contributions(auto_flagged, created_at)
    //   WHERE auto_flagged = true;
    // CREATE INDEX idx_contributions_by_state ON contributions(status, entity_state, created_at DESC)
    //   WHERE status = 'pending';
    // CREATE INDEX idx_contributions_by_user_status ON contributions(user_id, status, created_at DESC);
    // Spatial indexes — defined in migration DDL:
    // CREATE INDEX idx_contributions_geom_after ON contributions USING GIST(geometry_after)
    //   WHERE geometry_after IS NOT NULL;
    // CREATE INDEX idx_contributions_geom_pending ON contributions USING GIST(geometry_after)
    //   WHERE status = 'pending' AND geometry_after IS NOT NULL;
  ]
);

export type ContributionSelect = typeof contributions.$inferSelect;
export type ContributionInsert = typeof contributions.$inferInsert;
