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
  fields: z.string().optional(),
  sort: z.enum(["name"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

type SortField = "name";

function sortRateStructures(
  rateStructures: RateStructure[],
  sortField: SortField,
  order: "asc" | "desc"
): RateStructure[] {
  return [...rateStructures].sort((a, b) => {
    const aa = a[sortField] ?? "";
    const bb = b[sortField] ?? "";
    let cmp = (aa as string).localeCompare(bb as string);

    if (cmp === 0) {
      cmp = a.id.localeCompare(b.id);
    }

    return order === "desc" ? -cmp : cmp;
  });
}

function tryEncodeCursor(data: CursorV1): string | null {
  try {
    return encodeCursor(data);
  } catch {
    return null;
  }
}

function applyCursor(
  sorted: RateStructure[],
  cursor: CursorV1,
  sortField: SortField,
  order: "asc" | "desc"
): RateStructure[] {
  const cursorSortValue = cursor.s[sortField] as string | undefined;
  const cursorId = cursor.id;

  const startIdx = sorted.findIndex((item) => {
    const itemValue = item[sortField] ?? "";
    const cmpVal = cursorSortValue ?? "";
    const cmp = (itemValue as string).localeCompare(cmpVal);

    if (order === "asc") {
      return cmp > 0 || (cmp === 0 && item.id > cursorId);
    }
    return cmp < 0 || (cmp === 0 && item.id > cursorId);
  });

  return startIdx === -1 ? [] : sorted.slice(startIdx);
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

  const allRateStructures = await loadRateStructures({
    search,
    sector,
    hasTou,
    hasDemandCharge,
    hasNetMetering,
    isEvRate,
  });

  const sorted = sortRateStructures(allRateStructures, sort, order);
  const totalCount = sorted.length;
  const afterCursor = cursor ? applyCursor(sorted, cursor, sort, order) : sorted;
  const page = afterCursor.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;

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
