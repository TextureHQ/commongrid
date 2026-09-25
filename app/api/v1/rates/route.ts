/**
 * GET /api/v1/rates
 *
 * List rate structures with filtering, sorting, cursor pagination, and sparse
 * field projection.
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
import { loadRateStructures } from "@/lib/data/rate-structures";
import type { RateStructure } from "@/types/rate-structures";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const booleanParam = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => (typeof v === "boolean" ? v : v === "true"))
  .optional();

const querySchema = z.object({
  search: z.string().min(2).max(200).optional(),
  sector: z.string().optional(),
  hasTou: booleanParam,
  hasDemandCharge: booleanParam,
  hasNetMetering: booleanParam,
  isEvRate: booleanParam,
  utilityId: z.string().optional(),
  eiaId: z.coerce.number().int().optional(),
  fields: z.string().optional(),
  sort: z.enum(["name"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

function tryEncodeCursor(data: CursorV1): string | null {
  try {
    return encodeCursor(data);
  } catch {
    return null;
  }
}

const ALL_FIELDS = new Set<string>([
  "id",
  "slug",
  "name",
  "eiaId",
  "utilityId",
  "regionId",
  "utilityName",
  "sector",
  "serviceType",
  "description",
  "fixedCharge",
  "fixedChargeUnits",
  "energyRateStructure",
  "energyWeekdaySchedule",
  "energyWeekendSchedule",
  "demandRateStructure",
  "flatDemandStructure",
  "demandRateUnit",
  "netMeteringRules",
  "hasTou",
  "hasDemandCharge",
  "hasNetMetering",
  "isEvRate",
  "startDate",
  "endDate",
  "approved",
  "isDefault",
  "source",
  "sourceUrl",
  "sourceParentUrl",
  "sourceDate",
  "sourceUrlStatus",
  "sourceUrlCheckedAt",
  "createdAt",
  "updatedAt",
  "version",
]);

function projectFields(rateStructure: RateStructure, fields: string[]): Partial<RateStructure> {
  const result: Partial<RateStructure> = {};
  for (const field of fields) {
    if (ALL_FIELDS.has(field)) {
      (result as Record<string, unknown>)[field] = (rateStructure as unknown as Record<string, unknown>)[field];
    }
  }
  return result;
}

async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid query parameters", { issues: parsed.error.issues });
  }

  const {
    search,
    sector,
    hasTou,
    hasDemandCharge,
    hasNetMetering,
    isEvRate,
    utilityId,
    eiaId,
    fields,
    sort,
    order,
    limit,
    cursor: rawCursor,
  } = parsed.data;

  let cursor: CursorV1 | null = null;
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
  }

  const { items, totalCount, hasMore } = await loadRateStructures({
    search,
    sector,
    hasTou,
    hasDemandCharge,
    hasNetMetering,
    isEvRate,
    utilityId,
    eiaId,
    sort,
    order,
    limit,
    cursor,
  });

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = tryEncodeCursor({ v: 1, s: { [sort]: last[sort] }, id: last.id });
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
    "Cache-Tag": "rates",
  });
}

export async function GET(req: Request): Promise<Response> {
  return withApiMiddleware(handler)(req, {
    requestId: "",
  });
}
