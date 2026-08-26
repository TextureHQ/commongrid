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
 * Cache policy for responses that are safe to hold in a shared cache: public,
 * non-personalized reads of slow-moving reference data (utilities, power
 * plants, territories, ...). 60s at the edge, with a 5 minute grace window.
 */
export const PUBLIC_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * Cache policy for everything else. Must be the DEFAULT, not the opt-in.
 *
 * The edge cache keys on URL, not on Cookie or Authorization, so a response
 * marked `public` can be stored once and replayed to other callers hitting the
 * same URL. That is wrong twice over for authenticated endpoints:
 *
 *  1. Staleness. A moderator who approves a contribution refetches the queue
 *     and can be served a snapshot from before their own write — observed as a
 *     ~45s Pending -> Approved lag in the mod UI (CG-256).
 *  2. Disclosure. A moderator- or user-scoped payload should never sit in a
 *     shared cache at all.
 *
 * `private` keeps it out of shared caches even if some upstream ignores
 * `no-store`; `must-revalidate` covers caches that ignore both.
 */
export const PRIVATE_CACHE_CONTROL = "private, no-store, must-revalidate";

/**
 * Create a JSON `Response`.
 *
 * Defaults to a non-cacheable response. Anything personalized, authenticated,
 * or mutated by user action must use this. For public reference data that is
 * identical for every caller, use {@link cachedJsonResponse} instead — opting
 * IN to caching is a deliberate act, because opting out silently was the bug.
 *
 * @param data    - Serialisable payload.
 * @param status  - HTTP status code (default `200`).
 * @param headers - Additional headers to merge in.
 */
export function jsonResponse(data: unknown, status: number = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": PRIVATE_CACHE_CONTROL,
      ...headers,
    },
  });
}

/**
 * Create a JSON `Response` that shared caches may store for 60s.
 *
 * Only for public, non-personalized reads. If the payload varies by caller —
 * by session, API key identity, or any `user_id`-style filter — it does not
 * belong here; use {@link jsonResponse}.
 *
 * @param data    - Serialisable payload.
 * @param status  - HTTP status code (default `200`).
 * @param headers - Additional headers to merge in.
 */
export function cachedJsonResponse(
  data: unknown,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": PUBLIC_CACHE_CONTROL,
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
