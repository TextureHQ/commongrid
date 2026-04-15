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

export interface PaginationParams {
  cursor: CursorV1 | null;
  limit: number;
  sort: string | undefined;
  order: "asc" | "desc";
}

/**
 * Extract and validate pagination params from a URLSearchParams instance.
 *
 * This is a lightweight parser intended for use *before* Zod schemas run,
 * so route handlers can get decoded cursor data early. For full validation,
 * prefer the Zod `paginationSchema` in `validation.ts`.
 */
export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const rawCursor = searchParams.get("cursor");
  const rawLimit = searchParams.get("limit");
  const rawSort = searchParams.get("sort");
  const rawOrder = searchParams.get("order");

  const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 200) : 50;
  const order = rawOrder === "desc" ? "desc" : "asc";

  return {
    cursor: rawCursor ? decodeCursor(rawCursor) : null,
    limit,
    sort: rawSort ?? undefined,
    order,
  };
}
