/**
 * GET /api/v1/programs
 *
 * List programs with filtering, sorting, cursor pagination, and sparse
 * field projection.
 */

import { z } from "zod";

import {
  ApiError,
  type CursorV1,
  decodeCursor,
  encodeCursor,
  jsonResponse,
  paginatedResponse,
  withCors,
  withErrorHandling,
  withRequestId,
  withTiming,
} from "@/lib/api";
import { stripInternal } from "@/lib/api/public-response";
import { loadPrograms } from "@/lib/data/programs";
import type { Program } from "@/types/programs";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  status: z.string().optional(),
  assetType: z.string().optional(),
  marketSegment: z.string().optional(),
  gridService: z.string().optional(),
  search: z.string().min(2).max(200).optional(),
  fields: z.string().optional(),
  sort: z.enum(["name", "status"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

type SortField = "name" | "status";

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortPrograms(programs: Program[], sortField: SortField, order: "asc" | "desc"): Program[] {
  return [...programs].sort((a, b) => {
    let cmp = (a[sortField] as string).localeCompare(b[sortField] as string);

    // Secondary: name (when not the primary sort key)
    if (cmp === 0 && sortField !== "name") {
      cmp = a.name.localeCompare(b.name);
    }

    // Tertiary: id (tiebreaker)
    if (cmp === 0) {
      cmp = a.id.localeCompare(b.id);
    }

    return order === "desc" ? -cmp : cmp;
  });
}

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

/** Encode cursor, returning null if CURSOR_SECRET is not set (dev degraded mode). */
function tryEncodeCursor(data: CursorV1): string | null {
  try {
    return encodeCursor(data);
  } catch {
    return null;
  }
}

/** Apply cursor offset to a sorted program list. */
function applyCursor(sorted: Program[], cursor: CursorV1, sortField: SortField, order: "asc" | "desc"): Program[] {
  const cursorSortValue = cursor.s[sortField] as string | undefined;
  const cursorId = cursor.id;

  const startIdx = sorted.findIndex((item) => {
    const itemValue = item[sortField] as string;
    const cmpVal = cursorSortValue ?? "";
    const cmp = itemValue.localeCompare(cmpVal);

    if (order === "asc") {
      return cmp > 0 || (cmp === 0 && item.id > cursorId);
    } else {
      return cmp < 0 || (cmp === 0 && item.id > cursorId);
    }
  });

  return startIdx === -1 ? [] : sorted.slice(startIdx);
}

// ---------------------------------------------------------------------------
// Field projection
// ---------------------------------------------------------------------------

const ALL_FIELDS = new Set<string>([
  "id",
  "slug",
  "name",
  "description",
  "organizations",
  "assetTypes",
  "marketSegments",
  "participationModels",
  "incentiveStructures",
  "gridServices",
  "regions",
  "compensationTiers",
  "capacityTarget",
  "maxEnrollments",
  "programSeason",
  "launchedAt",
  "enrollmentOpens",
  "enrollmentCloses",
  "endsAt",
  "status",
  "programWebsite",
  "faqUrl",
  "termsUrl",
  "contactUrl",
  "variants",
  "createdAt",
  "updatedAt",
]);

function projectFields(program: Program, fields: string[]): Partial<Program> {
  const result: Partial<Program> = {};
  for (const field of fields) {
    if (ALL_FIELDS.has(field)) {
      (result as Record<string, unknown>)[field] = (program as unknown as Record<string, unknown>)[field];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);

  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid query parameters", {
      issues: parsed.error.issues,
    });
  }

  const {
    status,
    assetType,
    marketSegment,
    gridService,
    search,
    fields,
    sort,
    order,
    limit,
    cursor: rawCursor,
  } = parsed.data;

  // Decode cursor if provided
  let cursor: CursorV1 | null = null;
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
  }

  // Load filtered data
  const allPrograms = await loadPrograms({
    status,
    assetType,
    marketSegment,
    gridService,
    search,
  });

  // Sort
  const sorted = sortPrograms(allPrograms, sort, order);
  const totalCount = sorted.length;

  // Apply cursor offset for next-page traversal
  const afterCursor = cursor ? applyCursor(sorted, cursor, sort, order) : sorted;

  // Slice page (fetch one extra to detect hasMore)
  const page = afterCursor.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;

  // Encode next cursor from last item on this page
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = tryEncodeCursor({
      v: 1,
      s: { [sort]: last[sort] },
      id: last.id,
    });
  }

  // Field projection
  const requestedFields = fields
    ? fields
        .split(",")
        .map((f) => f.trim())
        .filter((f) => ALL_FIELDS.has(f))
    : null;

  const data = requestedFields ? items.map((p) => projectFields(p, requestedFields)) : items;

  const envelope = paginatedResponse(stripInternal(data), totalCount, nextCursor, limit);

  return jsonResponse(envelope, 200, {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    "Cache-Tag": "programs",
  });
}

export async function GET(req: Request): Promise<Response> {
  return withRequestId(withErrorHandling(withTiming(withCors(handler))))(req, {
    requestId: "",
  });
}
