/**
 * Zod validation schemas for CommonGrid API query parameters.
 *
 * These schemas validate and coerce the query parameters documented in
 * §4.1 of the persistence-api spec: pagination, spatial, search, and
 * sparse field selection.
 */

import { z } from "zod";

import { ApiError } from "./errors";

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
  if (parts.length !== 4 || parts.some(isNaN)) {
    throw new ApiError(
      "BAD_REQUEST",
      "Invalid bbox format. Expected: west,south,east,north"
    );
  }
  return {
    west: parts[0],
    south: parts[1],
    east: parts[2],
    north: parts[3],
  };
}
