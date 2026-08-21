/**
 * POST /api/v1/contributions — Submit a community contribution
 * GET  /api/v1/contributions — List contributions with filters
 *
 * Requires Clerk auth for POST. GET is public with optional filters.
 *
 * See docs/specs/community-contributions-api-erd.md §3 and
 * docs/specs/community-contributions-api-prd.md for full specification.
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { communityEditableFields, contributions, entityLocks } from "@/lib/db/schema";
import { users } from "@/lib/db/schema/users";
import { isKnockConfigured } from "@/lib/knock/client";
import { triggerContributionSubmitted, triggerModNewContribution } from "@/lib/knock/workflows";
import { type ChangeType, EDIT_SUMMARY_MIN_LENGTH, getEntityTable } from "@/lib/mod/apply-contribution";
import { type AutoApproveResult, tryAutoApprove } from "@/lib/mod/auto-approve";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ENTITY_TYPES = [
  "utility",
  "power_plant",
  "ev_station",
  "territory",
  "transmission_line",
  "pricing_node",
  "iso",
  "rto",
  "balancing_authority",
  "region",
  "program",
] as const;

const VALID_SOURCE_TYPES = [
  "eia_filing",
  "utility_website",
  "state_puc",
  "sec_filing",
  "ferc_filing",
  "news_article",
  "academic_paper",
  "government_db",
  "personal_observation",
  "other",
] as const;

const VALID_STATUSES = [
  "pending",
  "approved",
  "returned",
  "changes_requested",
  "auto_approved",
  "version_conflict",
  "withdrawn",
] as const;

type EntityType = (typeof VALID_ENTITY_TYPES)[number];

// The entity_type -> Drizzle table map lives in lib/mod/apply-contribution.ts,
// which is also where writes happen. Keeping one copy means a new entity type
// cannot be contributable but unappliable (or vice versa).

// ---------------------------------------------------------------------------
// POST /api/v1/contributions — Submit a contribution
// ---------------------------------------------------------------------------

async function handlePost(req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();

  // Check if user is banned
  if (user.bannedAt) {
    const now = new Date();
    if (!user.bannedUntil || user.bannedUntil > now) {
      throw new ApiError("FORBIDDEN", "Your account is currently suspended and cannot submit contributions.");
    }
  }

  const body = await req.json();
  const {
    entity_type,
    entity_id,
    entity_version,
    edit_summary,
    source_type,
    source_url,
    source_date,
    changes,
    changeset_id,
    geometry_change_type,
    change_type,
  } = body;

  const isCreate = change_type === "create";
  const isDelete = change_type === "delete";

  // --- Validation ---

  // entity_type
  if (!entity_type || !VALID_ENTITY_TYPES.includes(entity_type)) {
    throw new ApiError("VALIDATION_ERROR", `entity_type must be one of: ${VALID_ENTITY_TYPES.join(", ")}`, {
      field: "entity_type",
    });
  }

  // entity_id
  if (!entity_id || typeof entity_id !== "string") {
    throw new ApiError("VALIDATION_ERROR", "entity_id is required and must be a string.", { field: "entity_id" });
  }

  // entity_version
  if (entity_version === undefined || typeof entity_version !== "number" || !Number.isInteger(entity_version)) {
    throw new ApiError("VALIDATION_ERROR", "entity_version is required and must be an integer.", {
      field: "entity_version",
    });
  }

  // edit_summary (min 25 chars)
  if (!edit_summary || typeof edit_summary !== "string" || edit_summary.trim().length < EDIT_SUMMARY_MIN_LENGTH) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `edit_summary is required and must be at least ${EDIT_SUMMARY_MIN_LENGTH} characters.`,
      {
        field: "edit_summary",
      }
    );
  }

  // source_type
  if (!source_type || !VALID_SOURCE_TYPES.includes(source_type)) {
    throw new ApiError("VALIDATION_ERROR", `source_type must be one of: ${VALID_SOURCE_TYPES.join(", ")}`, {
      field: "source_type",
    });
  }

  // changes JSONB — must be a non-empty object
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || Object.keys(changes).length === 0) {
    throw new ApiError("VALIDATION_ERROR", "changes is required and must be a non-empty object with field changes.", {
      field: "changes",
    });
  }

  const db = getDb();

  // --- Entity existence check (skip for creates) ---
  const entityTable = getEntityTable(entity_type as EntityType);
  // biome-ignore lint/suspicious/noExplicitAny: Entity type varies by entityType
  let entity: any = null;
  let entitySlug: string;
  let entityState: string | null = null;

  let resolved_entity_id = entity_id;

  if (isCreate) {
    // For creates, generate a slug from the name
    const nameField = changes.name?.new || changes.stationName?.new || changes.station_name?.new;
    if (!nameField || typeof nameField !== "string") {
      throw new ApiError("VALIDATION_ERROR", "name is required for creating a new entity.", { field: "name" });
    }
    // Import slugify
    const { slugify } = await import("@/lib/slugify");
    entitySlug = slugify(nameField);

    // Derive state from changes if available
    entityState = (changes.state?.new || changes.jurisdiction?.new?.split(",")[0]?.trim() || null) as string | null;
  } else {
    // For edits, entity must exist
    const idCondition = eq(entityTable.id, entity_id);
    const slugCondition =
      "slug" in entityTable ? eq((entityTable as { slug: (typeof entityTable)["id"] }).slug, entity_id) : undefined;
    const condition = slugCondition ? or(idCondition, slugCondition) : idCondition;

    [entity] = await db.select().from(entityTable).where(condition).limit(1);

    if (!entity) {
      throw new ApiError("NOT_FOUND", `Entity ${entity_type}/${entity_id} not found.`);
    }

    resolved_entity_id = entity.id;
    entitySlug = entity.slug ?? entity.id;
    // Try common state column names
    entityState = entity.state ?? entity.jurisdiction?.split(",")[0]?.trim() ?? null;
  }

  // --- Entity lock check (skip for creates) ---
  if (!isCreate) {
    const [lock] = await db
      .select()
      .from(entityLocks)
      .where(
        and(
          eq(entityLocks.entityType, entity_type),
          eq(entityLocks.entityId, resolved_entity_id),
          // Only respect non-expired locks
          sql`(${entityLocks.expiresAt} IS NULL OR ${entityLocks.expiresAt} > NOW())`
        )
      )
      .limit(1);

    if (lock) {
      if (lock.lockLevel === "fully_locked") {
        throw new ApiError("FORBIDDEN", "This entity is locked and cannot be edited by community contributors.");
      }
      if (lock.lockLevel === "semi_locked" && user.role === "contributor") {
        throw new ApiError(
          "FORBIDDEN",
          "This entity is semi-locked. Only trusted contributors and moderators can edit it."
        );
      }
    }
  }

  // --- Normalize changes to { field: { old, new } } format ---
  // The EditEntityPanel may send flat { field: value } format;
  // we normalize here so the review handler always gets { field: { old, new } }
  const normalizedChanges: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "new" in (value as Record<string, unknown>)
    ) {
      // Already in { old, new } format
      normalizedChanges[key] = value as { old: unknown; new: unknown };
    } else {
      // Flat format: look up old value from entity if available
      const oldValue = entity ? (entity[key] ?? null) : null;
      normalizedChanges[key] = { old: oldValue, new: value };
    }
  }

  // --- Validate multi_enum field values against the registered option list ---
  // multi_enum fields are JSONB enum arrays (e.g. program grid_services). Their
  // values must be an array whose members are all in community_editable_fields
  // validation_rules.enum, so invalid members cannot slip in via any approval
  // path (a non-critical multi_enum can auto-approve for trusted contributors).
  const multiEnumMeta = await db
    .select({
      fieldName: communityEditableFields.fieldName,
      validationRules: communityEditableFields.validationRules,
    })
    .from(communityEditableFields)
    .where(
      and(eq(communityEditableFields.entityType, entity_type), eq(communityEditableFields.fieldType, "multi_enum"))
    );

  for (const meta of multiEnumMeta) {
    const change = normalizedChanges[meta.fieldName];
    if (!change) continue;
    const next = change.new;
    // null/undefined clears the field; that is allowed.
    if (next === null || next === undefined) continue;
    if (!Array.isArray(next)) {
      throw new ApiError("VALIDATION_ERROR", `${meta.fieldName} must be an array of enum values.`, {
        field: meta.fieldName,
      });
    }
    const allowed = ((meta.validationRules as { enum?: string[] } | null)?.enum ?? []) as string[];
    const invalid = next.filter((v) => typeof v !== "string" || !allowed.includes(v));
    if (invalid.length > 0) {
      throw new ApiError("VALIDATION_ERROR", `${meta.fieldName} contains invalid values: ${invalid.join(", ")}`, {
        field: meta.fieldName,
      });
    }
    // Reject duplicates so the stored array is a clean set.
    if (new Set(next).size !== next.length) {
      throw new ApiError("VALIDATION_ERROR", `${meta.fieldName} contains duplicate values.`, {
        field: meta.fieldName,
      });
    }
  }

  const [contribution] = await db
    .insert(contributions)
    .values({
      userId: user.id,
      changesetId: changeset_id ?? null,
      entityType: entity_type,
      entityId: resolved_entity_id,
      entityVersion: entity_version,
      entitySlug: entitySlug,
      entityState: entityState,
      changes: normalizedChanges,
      geometryChangeType: geometry_change_type ?? null,
      editSummary: edit_summary.trim(),
      sourceType: source_type,
      sourceUrl: source_url ?? null,
      sourceDate: source_date ?? null,
      status: "pending",
      changeType: change_type ?? "update",
    })
    .returning();

  // --- Try auto-approval ---
  // tryAutoApprove now applies the edit itself, through the same
  // applyContribution path a moderator approval uses — entity write, version
  // row, status and stats in one transaction. It previously only flipped the
  // status, so auto-approved edits were accepted and then discarded.
  let autoApproveResult: AutoApproveResult & { newSlug?: string } = { autoApproved: false };
  if (!geometry_change_type) {
    // Geometry changes always require manual review
    const changeType: ChangeType = isCreate ? "create" : isDelete ? "delete" : "update";
    autoApproveResult = await tryAutoApprove(user, contribution, changeType);

    if (isCreate && autoApproveResult.autoApproved) {
      autoApproveResult.newSlug = entitySlug;
    }
  }

  // If auto-approved, re-fetch to get the updated status
  const responseData = autoApproveResult.autoApproved
    ? ((await db.select().from(contributions).where(eq(contributions.id, contribution.id)).limit(1))[0] ?? contribution)
    : contribution;

  // Notify moderators of new contribution (if not auto-approved)
  if (isKnockConfigured() && !autoApproveResult.autoApproved) {
    const moderators = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.role} IN ('moderator', 'admin')`);

    const moderatorIds = moderators.map((m) => m.id);

    if (moderatorIds.length > 0) {
      void triggerModNewContribution(
        moderatorIds,
        {
          contributionId: contribution.id,
          contributorId: user.id,
          contributorName: user.displayName,
          entityType: entity_type,
          entitySlug: entitySlug,
          contributionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/contributions/${contribution.id}`,
          changeType: change_type ?? "update",
          fieldSummary: edit_summary.substring(0, 100),
        },
        contribution.id
      );
    }

    void triggerContributionSubmitted(
      user.id,
      {
        contributionId: contribution.id,
        entityType: entity_type,
        entitySlug: entitySlug,
        entityUrl: `${process.env.NEXT_PUBLIC_APP_URL}/${entity_type}s/${entitySlug}`,
        contributionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/contributions/${contribution.id}`,
      },
      `${contribution.id}-submitted`
    );
  }

  return jsonResponse(
    {
      data: responseData,
      ...(autoApproveResult.autoApproved ? { auto_approved: true } : {}),
    },
    201,
    { ...corsHeaders(), "X-Request-Id": ctx.requestId }
  );
}

// ---------------------------------------------------------------------------
// GET /api/v1/contributions — List contributions with filters
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const url = new URL(req.url);
  const db = getDb();

  // Parse filters
  const status = url.searchParams.get("status");
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");
  const userId = url.searchParams.get("user_id");

  // Pagination
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
  const offset = (page - 1) * limit;

  // Build conditions
  const conditions = [];

  if (status) {
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `status must be one of: ${VALID_STATUSES.join(", ")}`, {
        field: "status",
      });
    }
    conditions.push(eq(contributions.status, status));
  }

  if (entityType) {
    if (!VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
      throw new ApiError("VALIDATION_ERROR", `entity_type must be one of: ${VALID_ENTITY_TYPES.join(", ")}`, {
        field: "entity_type",
      });
    }
    conditions.push(eq(contributions.entityType, entityType));
  }

  if (entityId) {
    conditions.push(eq(contributions.entityId, entityId));
  }

  if (userId) {
    conditions.push(eq(contributions.userId, userId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count query
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(contributions);
  if (whereClause) {
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }
  const [{ count }] = await countQuery;

  // Data query
  let dataQuery = db.select().from(contributions).orderBy(desc(contributions.createdAt)).limit(limit).offset(offset);

  if (whereClause) {
    dataQuery = dataQuery.where(whereClause) as typeof dataQuery;
  }

  const rows = await dataQuery;
  const hasMore = offset + limit < Number(count);

  return jsonResponse(paginatedResponse(rows, Number(count), hasMore ? String(page + 1) : null, limit), 200, {
    ...corsHeaders(),
    "X-Request-Id": ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));
const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: generateRequestId() });
}
