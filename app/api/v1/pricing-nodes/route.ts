/**
 * GET /api/v1/pricing-nodes
 *
 * List pricing nodes with filtering, sorting, cursor pagination, and sparse
 * field projection. Data source is controlled by NEXT_PUBLIC_FF_DB_PRICING_NODES.
 */

import { z } from "zod";

import {
  ApiError,
  withErrorHandling,
  withRequestId,
  withTiming,
  withCors,
  jsonResponse,
  paginatedResponse,
  encodeCursor,
  decodeCursor,
  type CursorV1,
} from "@/lib/api";
import { loadPricingNodes } from "@/lib/data/pricing-nodes";
import type { PricingNode } from "@/types/pricing-nodes";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  iso: z.string().optional(),
  nodeType: z.string().optional(),
  state: z.string().optional(),
  search: z.string().min(2).max(200).optional(),
  fields: z.string().optional(),
  sort: z.enum(["name", "iso", "nodeType"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

type SortField = "name" | "iso" | "nodeType";

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortNodes(
  nodes: PricingNode[],
  sortField: SortField,
  order: "asc" | "desc"
): PricingNode[] {
  return [...nodes].sort((a, b) => {
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

/** Apply cursor offset to a sorted node list. */
function applyCursor(
  sorted: PricingNode[],
  cursor: CursorV1,
  sortField: SortField,
  order: "asc" | "desc"
): PricingNode[] {
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
  "id", "slug", "name", "iso", "nodeType",
  "latitude", "longitude", "zone", "state",
  "voltageKv", "eiaPlantCode", "source",
]);

function projectFields(
  node: PricingNode,
  fields: string[]
): Partial<PricingNode> {
  const result: Partial<PricingNode> = {};
  for (const field of fields) {
    if (ALL_FIELDS.has(field)) {
      (result as Record<string, unknown>)[field] =
        (node as unknown as Record<string, unknown>)[field];
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

  const { iso, nodeType, state, search, fields, sort, order, limit, cursor: rawCursor } =
    parsed.data;

  // Decode cursor if provided
  let cursor: CursorV1 | null = null;
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
  }

  // Load filtered data
  const allNodes = await loadPricingNodes({ iso, nodeType, state, search });

  // Sort
  const sorted = sortNodes(allNodes, sort, order);
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

  const data = requestedFields
    ? items.map((n) => projectFields(n, requestedFields))
    : items;

  const envelope = paginatedResponse(data, totalCount, nextCursor, limit);

  return withCors(
    jsonResponse(envelope, 200, {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "Cache-Tag": "pricing-nodes",
    })
  );
}

export async function GET(req: Request): Promise<Response> {
  return withRequestId(withErrorHandling(withTiming(handler)))(req, {
    requestId: "",
  });
}
