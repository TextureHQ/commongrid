/**
 * Zod validation schemas for CommonGrid API query parameters.
 *
 * These schemas validate and coerce the query parameters documented in
 * §4.1 of the persistence-api spec: pagination, spatial, search, and
 * sparse field selection.
 */

import { z } from "zod";
import { UtilitySegment, UtilityStatus } from "@/types/entities";

import { ApiError } from "./errors";

/** Allowed `segment` filter values for GET /utilities (matches DB + UtilitySegment). */
export const UTILITY_SEGMENT_VALUES = Object.values(UtilitySegment) as string[];

/** Allowed `status` filter values for GET /utilities (matches DB + UtilityStatus). */
export const UTILITY_STATUS_VALUES = Object.values(UtilityStatus) as string[];

/**
 * Parse a single-value or comma-separated enum filter. Unknown values → 400
 * with the allowed set listed (never a silent empty `data[]`).
 */
export function parseEnumFilterParam(raw: string | null, allowed: readonly string[], field: string): string[] | null {
  if (raw === null || raw.trim() === "") return null;
  const values = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (values.length === 0) return null;

  const allowedSet = new Set(allowed);
  const invalid = values.filter((v) => !allowedSet.has(v));
  if (invalid.length > 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `${field} must be one of: ${allowed.join(", ")}. Unknown: ${invalid.join(", ")}`,
      { field, allowed, invalid }
    );
  }
  return values;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
});

// ---------------------------------------------------------------------------
// Spatial queries
// ---------------------------------------------------------------------------

export const spatialSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(0).max(500).optional(), // km
  bbox: z.string().optional(), // "west,south,east,north"
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchSchema = z.object({
  search: z.string().min(2).max(200).optional(),
  q: z.string().min(2).max(200).optional(),
});

// ---------------------------------------------------------------------------
// Sparse field selection
// ---------------------------------------------------------------------------

export const fieldsSchema = z.object({
  fields: z.string().optional(), // comma-separated field names
});

// ---------------------------------------------------------------------------
// Bbox parser
// ---------------------------------------------------------------------------

export interface BboxValues {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Parse and validate a bbox query string into numeric bounds.
 *
 * Expected format: `"west,south,east,north"` (four comma-separated numbers).
 */
export function parseBbox(bbox: string): BboxValues {
  const parts = bbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new ApiError("BAD_REQUEST", "Invalid bbox format. Expected: west,south,east,north");
  }
  return {
    west: parts[0],
    south: parts[1],
    east: parts[2],
    north: parts[3],
  };
}
