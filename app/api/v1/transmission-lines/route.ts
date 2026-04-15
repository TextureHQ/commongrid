/**
 * GET /api/v1/transmission-lines
 *
 * List transmission lines with filtering, sorting, cursor pagination, and sparse
 * field projection. Data source is controlled by NEXT_PUBLIC_FF_DB_TRANSMISSION.
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
import { loadTransmissionLines, countTransmissionLines } from "@/lib/data/transmission-lines";
import type { TransmissionLine } from "@/types/transmission-lines";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  voltageClass: z.string().optional(),
  owner: z.string().optional(),
  status: z.string().optional(),
  search: z.string().min(2).max(200).optional(),
  fields: z.string().optional(),
  sort: z.enum(["owner", "voltageClass", "lengthMiles"]).default("owner"),
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

type SortField = "owner" | "voltageClass" | "lengthMiles";

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortLines(lines: TransmissionLine[], sortField: SortField, order: "asc" | "desc"): TransmissionLine[] {
  return [...lines].sort((a, b) => {
    let cmp: number;

    if (sortField === "lengthMiles") {
      cmp = (a.lengthMiles ?? 0) - (b.lengthMiles ?? 0);
    } else {
      cmp = (a[sortField] as string).localeCompare(b[sortField] as string);
    }

    // Secondary: owner (when not the primary sort key)
    if (cmp === 0 && sortField !== "owner") {
      cmp = a.owner.localeCompare(b.owner);
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

/** Apply cursor offset to a sorted transmission line list. */
function applyCursor(
  sorted: TransmissionLine[],
  cursor: CursorV1,
  sortField: SortField,
  order: "asc" | "desc"
): TransmissionLine[] {
  const cursorSortValue = cursor.s[sortField];
  const cursorId = cursor.id;

  const startIdx = sorted.findIndex((item) => {
    if (sortField === "lengthMiles") {
      const itemValue = item.lengthMiles ?? 0;
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
  "objectId",
  "id",
  "type",
  "status",
  "owner",
  "voltage",
  "voltClass",
  "voltageClass",
  "sub1",
  "sub2",
  "lengthMiles",
  "naicsCode",
  "source",
]);

function projectFields(line: TransmissionLine, fields: string[]): Partial<TransmissionLine> {
  const result: Partial<TransmissionLine> = {};
  for (const field of fields) {
    if (ALL_FIELDS.has(field)) {
      (result as Record<string, unknown>)[field] = (line as unknown as Record<string, unknown>)[field];
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

  const { voltageClass, owner, status, search, fields, sort, order, limit, cursor: rawCursor } = parsed.data;

  // Decode cursor if provided
  let cursor: CursorV1 | null = null;
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
  }

  // When using DB mode, delegate sorting + pagination to SQL for performance
  const { getDataSource } = await import("@/lib/feature-flags");
  const useDb = getDataSource("transmissionLines") === "db";

  let items: TransmissionLine[];
  let totalCount: number;
  let hasMore: boolean;

  if (useDb && !cursor) {
    // DB mode: use SQL-level pagination with accurate count
    const filters = { voltageClass, owner, status, search };
    
    // Parallel: fetch page + total count
    const [results, count] = await Promise.all([
      loadTransmissionLines({
        filters,
        sort,
        order,
        limit: limit + 1, // Fetch one extra to detect hasMore
        offset: 0,
      }),
      countTransmissionLines(filters),
    ]);

    hasMore = results.length > limit;
    items = hasMore ? results.slice(0, limit) : results;
    totalCount = count;
  } else {
    // JSON mode OR cursor-based pagination: use in-memory sort/pagination
    const allLines = await loadTransmissionLines({
      filters: { voltageClass, owner, status, search },
    });

    // Sort
    const sorted = sortLines(allLines, sort, order);
    totalCount = sorted.length;

    // Apply cursor offset for next-page traversal
    const afterCursor = cursor ? applyCursor(sorted, cursor, sort, order) : sorted;

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
      s: { [sort]: last[sort as keyof TransmissionLine] },
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

  const data = requestedFields ? items.map((l) => projectFields(l, requestedFields)) : items;

  const envelope = paginatedResponse(data, totalCount, nextCursor, limit);

  return jsonResponse(envelope, 200, {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    "Cache-Tag": "transmission-lines",
  });
}

export async function GET(req: Request): Promise<Response> {
  return withRequestId(withErrorHandling(withTiming(withCors(handler))))(req, {
    requestId: "",
  });
}
