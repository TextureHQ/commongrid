/**
 * HMAC-signed cursor pagination for CommonGrid API.
 *
 * Cursors are base64url-encoded JSON payloads with a truncated HMAC-SHA256
 * signature appended. This prevents cursor injection / tampering.
 *
 * See docs/specs/persistence-api.md §4.2 for the full design.
 */

import { createHmac } from "node:crypto";

import { ApiError } from "./errors";

// ---------------------------------------------------------------------------
// Cursor types
// ---------------------------------------------------------------------------

export interface CursorV1 {
  /** Cursor format version (always 1 for now). */
  v: 1;
  /** Sort-field values at the boundary row (keyset pagination). */
  s: Record<string, unknown>;
  /** Entity ID of the boundary row (tiebreaker). */
  id: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSecret(): string {
  const secret = process.env.CURSOR_SECRET;
  if (!secret) {
    throw new ApiError("INTERNAL_ERROR", "CURSOR_SECRET environment variable is not set");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Encode a cursor payload into a signed, URL-safe string. */
export function encodeCursor(data: CursorV1): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/** Decode and verify a signed cursor string. Throws on tamper. */
export function decodeCursor(cursor: string): CursorV1 {
  const dotIndex = cursor.lastIndexOf(".");
  if (dotIndex === -1) {
    throw new ApiError("BAD_REQUEST", "Invalid cursor format");
  }

  const payload = cursor.slice(0, dotIndex);
  const signature = cursor.slice(dotIndex + 1);
  const expectedSig = sign(payload);

  if (signature !== expectedSig) {
    throw new ApiError("BAD_REQUEST", "Invalid cursor signature");
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as CursorV1;
  } catch {
    throw new ApiError("BAD_REQUEST", "Malformed cursor payload");
  }
}

// ---------------------------------------------------------------------------
// Query-param convenience parser
// ---------------------------------------------------------------------------

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface PaginationParams {
  cursor: CursorV1 | null;
  limit: number;
  sort: string | undefined;
  order: SortOrder;
}

export interface ParsePaginationOptions {
  /**
   * Allowed `sort` field names for this endpoint. When provided, absent `sort`
   * falls back to `defaultSort` (or the first allowlist entry) and unknown
   * values throw `VALIDATION_ERROR` — matching Zod-validated list routes.
   */
  allowedSorts?: readonly string[];
  /** Default when `sort` is absent. Defaults to `allowedSorts[0]`. */
  defaultSort?: string;
}

/**
 * Extract and validate pagination params from a URLSearchParams instance.
 *
 * Soft list routes pass `allowedSorts` so invalid `sort` / `order` return 400
 * (`VALIDATION_ERROR`) instead of silently defaulting. Zod-validated routes
 * continue to use `paginationSchema` in `validation.ts`.
 *
 * Supports two cursor formats:
 * - `page:N` (legacy JSON mode) - decoded and handled by JSON mode routes
 * - HMAC-signed cursors (database mode) - decoded here
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  options: ParsePaginationOptions = {}
): PaginationParams {
  const rawCursor = searchParams.get("cursor");
  const rawLimit = searchParams.get("limit");
  const rawSort = searchParams.get("sort");
  const rawOrder = searchParams.get("order");

  const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 200) : 50;
  const order = parseSortOrder(rawOrder);
  const sort = parseSortField(rawSort, options);

  // Handle page:N format cursors (JSON mode)
  // These are not decoded here - they're handled by JSON mode routes
  let cursor: CursorV1 | null = null;
  if (rawCursor && !rawCursor.startsWith("page:")) {
    cursor = decodeCursor(rawCursor);
  }

  return {
    cursor,
    limit,
    sort,
    order,
  };
}

function parseSortOrder(rawOrder: string | null): SortOrder {
  if (rawOrder === null || rawOrder.trim() === "") {
    return "asc";
  }
  if (rawOrder === "asc" || rawOrder === "desc") {
    return rawOrder;
  }
  throw new ApiError("VALIDATION_ERROR", `order must be one of: ${SORT_ORDERS.join(", ")}`, {
    field: "order",
    allowed: [...SORT_ORDERS],
    invalid: [rawOrder],
  });
}

function parseSortField(rawSort: string | null, options: ParsePaginationOptions): string | undefined {
  const { allowedSorts, defaultSort } = options;

  if (!allowedSorts || allowedSorts.length === 0) {
    return rawSort ?? undefined;
  }

  const fallback = defaultSort ?? allowedSorts[0];
  if (rawSort === null || rawSort.trim() === "") {
    return fallback;
  }

  if (!allowedSorts.includes(rawSort)) {
    throw new ApiError("VALIDATION_ERROR", `sort must be one of: ${allowedSorts.join(", ")}`, {
      field: "sort",
      allowed: [...allowedSorts],
      invalid: [rawSort],
    });
  }

  return rawSort;
}
