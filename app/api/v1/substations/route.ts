/**
 * GET /api/v1/substations
 *
 * List substations with filtering, sorting, offset pagination, and sparse
 * field projection. Mirrors the pattern used for power-plants.
 */

import { z } from "zod";

import {
  ApiError,
  jsonResponse,
  type RouteContext,
  withCors,
  withErrorHandling,
  withRequestId,
  withTiming,
} from "@/lib/api";
import { countSubstations, loadSubstations } from "@/lib/data/substations-api";
import type { SubstationDetail } from "@/types/entities";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  state: z.string().optional(),
  voltageClass: z.enum(["distribution", "sub_transmission", "transmission", "ehv", "unknown"]).optional(),
  status: z.enum(["operating", "retired", "planned", "proposed", "unknown"]).optional(),
  utilityId: z.string().optional(),
  baId: z.string().optional(),
  isoId: z.string().optional(),
  search: z.string().min(2).max(200).optional(),
  fields: z.string().optional(),
  sort: z.enum(["name", "state", "maxVoltageKv"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type SortField = "name" | "state" | "maxVoltageKv";

// ---------------------------------------------------------------------------
// Field projection
// ---------------------------------------------------------------------------

const ALL_FIELDS = new Set<string>([
  "id",
  "slug",
  "name",
  "eiaId",
  "osmId",
  "hifldObjectId",
  "owner",
  "operator",
  "utilityId",
  "minVoltageKv",
  "maxVoltageKv",
  "voltageClass",
  "substationType",
  "status",
  "state",
  "county",
  "latitude",
  "longitude",
  "balancingAuthorityId",
  "isoId",
  "nercRegion",
  "transmissionLineCount",
  "powerPlantCount",
  "pricingNodeCount",
  "source",
  "sourceUrl",
  "createdAt",
  "updatedAt",
]);

function projectFields(substation: SubstationDetail, fields: string[]): Partial<SubstationDetail> {
  const result: Partial<SubstationDetail> = {};
  for (const field of fields) {
    if (ALL_FIELDS.has(field)) {
      (result as Record<string, unknown>)[field] = (substation as unknown as Record<string, unknown>)[field];
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
    voltageClass,
    status,
    utilityId,
    baId,
    isoId,
    search,
    fields,
    sort,
    order,
    limit,
    offset,
  } = parsed.data;

  // Load results + count
  const [results, total] = await Promise.all([
    loadSubstations({
      state,
      voltageClass,
      status,
      utilityId,
      baId,
      isoId,
      search,
      sortField: sort as SortField,
      order,
      limit,
      offset,
    }),
    countSubstations({
      state,
      voltageClass,
      status,
      utilityId,
      baId,
      isoId,
      search,
    }),
  ]);

  // Check if more results exist
  const hasMore = results.length > limit;
  if (hasMore) {
    results.pop(); // Remove the extra result
  }

  // Apply field projection if requested
  const fieldList = fields ? fields.split(",").map((f) => f.trim()) : undefined;
  const data = fieldList ? results.map((s) => projectFields(s, fieldList)) : results;

  return jsonResponse(
    {
      data,
      pagination: {
        offset,
        limit,
        total,
        hasMore,
      },
    },
    200,
    {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
      "Cache-Tag": "substations:list",
    }
  );
}

export const GET = withRequestId(
  withErrorHandling(withTiming(withCors(handler)))
);

// Metadata
export const metadata = {
  description: "List US electric substations with filtering and pagination",
};
