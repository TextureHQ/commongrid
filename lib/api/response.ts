/**
 * Response builder helpers for CommonGrid API routes.
 *
 * Thin wrappers that enforce the standard response envelope and ensure
 * consistent Content-Type / status-code usage across all endpoints.
 */

import { type ApiError, formatError } from "./errors";
import type { PaginatedResponse } from "./types";

// ---------------------------------------------------------------------------
// Paginated response builder
// ---------------------------------------------------------------------------

/**
 * Build a standard paginated response envelope (§4.2).
 *
 * @param data   - The current page of items.
 * @param total  - Total number of matching records.
 * @param cursor - Signed cursor for the next page, or `null` if no more.
 * @param limit  - Page size that was used.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  cursor: string | null,
  limit: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      cursor,
      limit,
      total,
      hasMore: cursor !== null,
    },
  };
}

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------

/**
 * Create a JSON `Response` with sensible defaults.
 *
 * @param data    - Serialisable payload.
 * @param status  - HTTP status code (default `200`).
 * @param headers - Additional headers to merge in.
 */
export function jsonResponse(data: unknown, status: number = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      ...headers,
    },
  });
}

// ---------------------------------------------------------------------------
// Error response helper
// ---------------------------------------------------------------------------

/**
 * Create a JSON error `Response` from an `ApiError`.
 */
export function errorResponse(error: ApiError, requestId: string): Response {
  return Response.json(formatError(error, requestId), {
    status: error.status,
    headers: { "X-Request-Id": requestId },
  });
}
