/**
 * POST /api/v1/contributions — Submit a community contribution
 * GET  /api/v1/contributions — List contributions with filters
 *
 * Requires Clerk auth for POST. GET is public with optional filters.
 *
 * See docs/specs/community-contributions-api-erd.md §3 and
 * docs/specs/community-contributions-api-prd.md for full specification.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import {
  balancingAuthorities,
  contributions,
  entityLocks,
  evStations,
  isos,
  powerPlants,
  pricingNodes,
  programs,
  regions,
  rtos,
  territories,
  transmissionLines,
  utilities,
} from "@/lib/db/schema";
import { tryAutoApprove } from "@/lib/mod/auto-approve";

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
] as const;

type EntityType = (typeof VALID_ENTITY_TYPES)[number];

// ---------------------------------------------------------------------------
// Entity table lookup — maps entity_type to its Drizzle table
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: Drizzle table types vary; a union would be unwieldy
function getEntityTable(entityType: EntityType): any {
  const tableMap: Record<EntityType, unknown> = {
    utility: utilities,
    power_plant: powerPlants,
    ev_station: evStations,
    territory: territories,
    transmission_line: transmissionLines,
    pricing_node: pricingNodes,
    iso: isos,
    rto: rtos,
    balancing_authority: balancingAuthorities,
    region: regions,
    program: programs,
  };
  return tableMap[entityType];
}

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
  if (!edit_summary || typeof edit_summary !== "string" || edit_summary.trim().length < 25) {
    throw new ApiError("VALIDATION_ERROR", "edit_summary is required and must be at least 25 characters.", {
      field: "edit_summary",
    });
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
    [entity] = await db.select().from(entityTable).where(eq(entityTable.id, entity_id)).limit(1);

    if (!entity) {
      throw new ApiError("NOT_FOUND", `Entity ${entity_type}/${entity_id} not found.`);
    }

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
          eq(entityLocks.entityId, entity_id),
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

  // --- Insert the contribution ---
  const [contribution] = await db
    .insert(contributions)
    .values({
      userId: user.id,
      changesetId: changeset_id ?? null,
      entityType: entity_type,
      entityId: entity_id,
      entityVersion: entity_version,
      entitySlug: entitySlug,
      entityState: entityState,
      changes,
      geometryChangeType: geometry_change_type ?? null,
      editSummary: edit_summary.trim(),
      sourceType: source_type,
      sourceUrl: source_url ?? null,
      sourceDate: source_date ?? null,
      status: "pending",
    })
    .returning();

  // --- Try auto-approval ---
  let autoApproveResult: { autoApproved: boolean; reason?: string; newSlug?: string } = { autoApproved: false };
  if (!geometry_change_type) {
    // Geometry changes always require manual review
    autoApproveResult = await tryAutoApprove(
      db,
      user,
      contribution.id,
      entity_type,
      changes as Record<string, unknown>,
      isCreate,
      isDelete
    );

    // If create was auto-approved, we need to insert the entity
    if (isCreate && autoApproveResult.autoApproved) {
      await createEntity(
        db,
        entity_type as EntityType,
        entity_id,
        changes as Record<string, { old: null; new: unknown }>,
        entitySlug,
        user.id
      );
      autoApproveResult.newSlug = entitySlug;
    }
  }

  // If auto-approved, re-fetch to get the updated status
  const responseData = autoApproveResult.autoApproved
    ? ((await db.select().from(contributions).where(eq(contributions.id, contribution.id)).limit(1))[0] ?? contribution)
    : contribution;

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
// createEntity — Insert a new entity when a create contribution is auto-approved
// ---------------------------------------------------------------------------

async function createEntity(
  db: ReturnType<typeof getDb>,
  entityType: EntityType,
  entityId: string,
  changes: Record<string, { old: null; new: unknown }>,
  entitySlug: string,
  userId: string
): Promise<string> {
  const entityTable = getEntityTable(entityType);

  // Build the insert values from changes
  const insertValues: Record<string, unknown> = {
    id: entityId,
    slug: entitySlug,
    version: 1,
    submittedBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Extract field values from changes { field: { old: null, new: value } }
  for (const [field, change] of Object.entries(changes)) {
    insertValues[field] = change.new;
  }

  // Insert the entity
  await db.insert(entityTable).values(insertValues);

  return entityId;
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
