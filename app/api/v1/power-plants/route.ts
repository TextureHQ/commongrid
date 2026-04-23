/**
 * GET /api/v1/power-plants
 *
 * List power plants with filtering, sorting, cursor pagination, and sparse
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
import { countPowerPlants, loadPowerPlants } from "@/lib/data/power-plants-api";
import type { PowerPlant } from "@/types/entities";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  state: z.string().optional(),
  fuelCategory: z.string().optional(),
  status: z.string().optional(),
  utilityId: z.string().optional(),
  baId: z.string().optional(),
  search: z.string().min(2).max(200).optional(),
  fields: z.string().optional(),
  sort: z.enum(["name", "totalCapacityMw", "state"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

type SortField = "name" | "totalCapacityMw" | "state";

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortPlants(plants: PowerPlant[], sortField: SortField, order: "asc" | "desc"): PowerPlant[] {
  return [...plants].sort((a, b) => {
    let cmp: number;

    if (sortField === "totalCapacityMw") {
      cmp = a.totalCapacityMw - b.totalCapacityMw;
    } else {
      cmp = (a[sortField] as string).localeCompare(b[sortField] as string);
    }

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

/** Apply cursor offset to a sorted power plant list. */
function applyCursor(
  sorted: PowerPlant[],
  cursor: CursorV1,
  sortField: SortField,
  order: "asc" | "desc"
): PowerPlant[] {
  const cursorSortValue = cursor.s[sortField];
  const cursorId = cursor.id;

  const startIdx = sorted.findIndex((item) => {
    if (sortField === "totalCapacityMw") {
      const itemValue = item.totalCapacityMw;
      const cmpVal = (cursorSortValue as number) ?? 0;
      const diff = itemValue - cmpVal;
      if (order === "asc") {
        return diff > 0 || (diff === 0 && item.id > cursorId);
      } else {
        return diff < 0 || (diff === 0 && item.id > cursorId);
      }
    } else {
      const itemValue = item[sortField] as string;
      const cmpVal = (cursorSortValue as string) ?? "";
      const cmp = itemValue.localeCompare(cmpVal);
      if (order === "asc") {
        return cmp > 0 || (cmp === 0 && item.id > cursorId);
      } else {
        return cmp < 0 || (cmp === 0 && item.id > cursorId);
      }
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
  "plantCode",
  "utilityId",
  "utilityName",
  "balancingAuthorityId",
  "baCode",
  "state",
  "county",
  "latitude",
  "longitude",
  "nercRegion",
  "sector",
  "primaryFuel",
  "fuelCategory",
  "technologies",
  "energySources",
  "totalCapacityMw",
  "generatorCount",
  "operatingYear",
  "gridVoltageKv",
  "status",
  "proposedCapacityMw",
  "proposedOnlineYear",
]);

function projectFields(plant: PowerPlant, fields: string[]): Partial<PowerPlant> {
  const result: Partial<PowerPlant> = {};
  for (const field of fields) {
    if (ALL_FIELDS.has(field)) {
      (result as Record<string, unknown>)[field] = (plant as unknown as Record<string, unknown>)[field];
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
    state,
    fuelCategory,
    status,
    utilityId,
    baId,
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

  const filters = { state, fuelCategory, status, utilityId, baId, search };

  let items: PowerPlant[];
  let totalCount: number;
  let hasMore: boolean;

  if (!cursor) {
    // Use SQL-level pagination with accurate count
    const [results, count] = await Promise.all([
      loadPowerPlants({
        filters,
        sort,
        order,
        limit: limit + 1, // Fetch one extra to detect hasMore
        offset: 0,
      }),
      countPowerPlants(filters),
    ]);

    hasMore = results.length > limit;
    items = hasMore ? results.slice(0, limit) : results;
    totalCount = count;
  } else {
    // Cursor-based pagination: use in-memory sort/pagination
    const allPlants = await loadPowerPlants({ filters });

    // Sort
    const sorted = sortPlants(allPlants, sort, order);
    totalCount = sorted.length;

    // Apply cursor offset for next-page traversal
    const afterCursor = applyCursor(sorted, cursor, sort, order);

    // Slice page (fetch one extra to detect hasMore)
    const page = afterCursor.slice(0, limit + 1);
    hasMore = page.length > limit;
    items = hasMore ? page.slice(0, limit) : page;
  }

  // Encode next cursor from last item on this page
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = tryEncodeCursor({
      v: 1,
      s: { [sort]: last[sort as keyof PowerPlant] },
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

  const envelope = paginatedResponse(data, totalCount, nextCursor, limit);

  return jsonResponse(envelope, 200, {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    "Cache-Tag": "power-plants",
  });
}

export async function GET(req: Request): Promise<Response> {
  return withRequestId(withErrorHandling(withTiming(withCors(handler))))(req, {
    requestId: "",
  });
}
