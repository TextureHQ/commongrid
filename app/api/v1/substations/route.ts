/**
 * GET /api/v1/substations
 *
 * List substations with filtering, sorting, cursor pagination, and sparse
 * field projection. Mirrors the pattern used for power-plants.
 */

import { z } from "zod";

import {
  ApiError,
  type CursorV1,
  decodeCursor,
  encodeCursor,
  jsonResponse,
  paginatedResponse,
  withApiMiddleware,
} from "@/lib/api";
import { stripInternal } from "@/lib/api/public-response";
import { countSubstations, loadSubstations } from "@/lib/data/substations-api";
import type { SubstationRecord } from "@/types/substations";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  state: z.string().optional(),
  substationType: z.enum(["transmission", "distribution", "hybrid", "unknown"]).optional(),
  status: z.enum(["in_service", "out_of_service", "planned", "retired", "unknown"]).optional(),
  source: z.enum(["eia", "osm", "manual", "hybrid"]).optional(),
  ownerUtilityId: z.string().optional(),
  minMaxVoltageKv: z.coerce.number().int().min(0).optional(),
  search: z.string().min(2).max(200).optional(),
  fields: z.string().optional(),
  sort: z.enum(["name", "state", "maxVoltageKv"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

type SortField = "name" | "state" | "maxVoltageKv";

// ---------------------------------------------------------------------------
// Sorting (for cursor-based traversal that runs in memory)
// ---------------------------------------------------------------------------

function sortSubstations(rows: SubstationRecord[], sortField: SortField, order: "asc" | "desc"): SubstationRecord[] {
  return [...rows].sort((a, b) => {
    let cmp: number;
    if (sortField === "maxVoltageKv") {
      const av = a.maxVoltageKv ?? -1;
      const bv = b.maxVoltageKv ?? -1;
      cmp = av - bv;
    } else {
      const av = (a[sortField] as string) ?? "";
      const bv = (b[sortField] as string) ?? "";
      cmp = av.localeCompare(bv);
    }
    if (cmp === 0 && sortField !== "name") cmp = a.name.localeCompare(b.name);
    if (cmp === 0) cmp = a.id.localeCompare(b.id);
    return order === "desc" ? -cmp : cmp;
  });
}

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

function tryEncodeCursor(data: CursorV1): string | null {
  try {
    return encodeCursor(data);
  } catch {
    return null;
  }
}

function applyCursor(
  sorted: SubstationRecord[],
  cursor: CursorV1,
  sortField: SortField,
  order: "asc" | "desc"
): SubstationRecord[] {
  const cursorSortValue = cursor.s[sortField];
  const cursorId = cursor.id;

  const startIdx = sorted.findIndex((item) => {
    if (sortField === "maxVoltageKv") {
      const itemValue = item.maxVoltageKv ?? -1;
      const cmpVal = (cursorSortValue as number) ?? -1;
      const diff = itemValue - cmpVal;
      if (order === "asc") return diff > 0 || (diff === 0 && item.id > cursorId);
      return diff < 0 || (diff === 0 && item.id > cursorId);
    }
    const itemValue = (item[sortField] as string) ?? "";
    const cmpVal = (cursorSortValue as string) ?? "";
    const cmp = itemValue.localeCompare(cmpVal);
    if (order === "asc") return cmp > 0 || (cmp === 0 && item.id > cursorId);
    return cmp < 0 || (cmp === 0 && item.id > cursorId);
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
  "ownerName",
  "state",
  "county",
  "latitude",
  "longitude",
  "minVoltageKv",
  "maxVoltageKv",
  "voltageBand",
  "substationType",
  "status",
  "source",
  "sourceUrl",
  "eiaId",
  "osmId",
  "hifldLegacyId",
]);

function projectFields(row: SubstationRecord, fields: string[]): Partial<SubstationRecord> {
  const out: Partial<SubstationRecord> = {};
  for (const field of fields) {
    if (ALL_FIELDS.has(field)) {
      (out as Record<string, unknown>)[field] = (row as unknown as Record<string, unknown>)[field];
    }
  }
  return out;
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
    substationType,
    status,
    source,
    ownerUtilityId,
    minMaxVoltageKv,
    search,
    fields,
    sort,
    order,
    limit,
    cursor: rawCursor,
  } = parsed.data;

  let cursor: CursorV1 | null = null;
  if (rawCursor) cursor = decodeCursor(rawCursor);

  const filters = {
    state,
    substationType,
    status,
    source,
    ownerUtilityId,
    minMaxVoltageKv,
    search,
  };

  let items: SubstationRecord[];
  let totalCount: number;
  let hasMore: boolean;

  if (!cursor) {
    const [results, count] = await Promise.all([
      loadSubstations({ filters, sort, order, limit: limit + 1, offset: 0 }),
      countSubstations(filters),
    ]);

    hasMore = results.length > limit;
    items = hasMore ? results.slice(0, limit) : results;
    totalCount = count;
  } else {
    // Cursor path: rehydrate the (filtered) set, sort, slice.
    const all = await loadSubstations({ filters });
    const sorted = sortSubstations(all, sort, order);
    totalCount = sorted.length;

    const afterCursor = applyCursor(sorted, cursor, sort, order);
    const page = afterCursor.slice(0, limit + 1);
    hasMore = page.length > limit;
    items = hasMore ? page.slice(0, limit) : page;
  }

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = tryEncodeCursor({
      v: 1,
      s: { [sort]: last[sort as keyof SubstationRecord] as string | number | null },
      id: last.id,
    });
  }

  const requestedFields = fields
    ? fields
        .split(",")
        .map((f) => f.trim())
        .filter((f) => ALL_FIELDS.has(f))
    : null;

  const data = requestedFields ? items.map((r) => projectFields(r, requestedFields)) : items;

  const envelope = paginatedResponse(stripInternal(data), totalCount, nextCursor, limit);

  return jsonResponse(envelope, 200, {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    "Cache-Tag": "substations",
  });
}

export async function GET(req: Request): Promise<Response> {
  return withApiMiddleware(handler)(req, {
    requestId: "",
  });
}
