import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { publicJsonResponse } from "@/lib/api/public-response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { balancingAuthorities, isos, rtos, utilities } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/utilities/by-eia-id/[eiaId] — Get utility by EIA Utility ID
//
// Sibling to /api/v1/utilities/[slug]. Consumers that store canonical EIA
// Utility IDs can look up the same utility record directly instead of
// resolving slugs first.
//
// Identical response shape + ?include=iso,rto,ba / ?fields semantics to the
// slug route.
// ---------------------------------------------------------------------------

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

async function handleGet(req: Request, ctx: RouteContext) {
  const eiaId = ctx.params?.eiaId;
  if (!eiaId) {
    throw new ApiError("BAD_REQUEST", "Missing eiaId parameter");
  }

  const url = new URL(req.url);
  const include = url.searchParams.get("include");
  const fields = url.searchParams.get("fields");

  const db = getDb();
  const [utility] = await db
    .select()
    .from(utilities)
    .where(and(eq(utilities.eiaId, eiaId), isNull(utilities.deletedAt)))
    .limit(1);

  if (!utility) {
    throw new ApiError("NOT_FOUND", `Utility with EIA ID '${eiaId}' not found`);
  }

  const headers = { "Cache-Control": CACHE_CONTROL };

  if (include) {
    const includes = include.split(",").map((i) => i.trim());
    const result: Record<string, unknown> = { ...utility };

    const fetches: Promise<void>[] = [];

    if (includes.includes("iso") && utility.isoId) {
      fetches.push(
        db
          .select()
          .from(isos)
          .where(eq(isos.id, utility.isoId))
          .limit(1)
          .then(([iso]) => {
            result._iso = iso ?? null;
          })
      );
    }
    if (includes.includes("rto") && utility.rtoId) {
      fetches.push(
        db
          .select()
          .from(rtos)
          .where(eq(rtos.id, utility.rtoId))
          .limit(1)
          .then(([rto]) => {
            result._rto = rto ?? null;
          })
      );
    }
    if (includes.includes("ba") && utility.balancingAuthorityId) {
      fetches.push(
        db
          .select()
          .from(balancingAuthorities)
          .where(eq(balancingAuthorities.id, utility.balancingAuthorityId))
          .limit(1)
          .then(([ba]) => {
            result._ba = ba ?? null;
          })
      );
    }

    await Promise.all(fetches);
    return publicJsonResponse(result, 200, headers, { fields });
  }

  return publicJsonResponse(utility, 200, headers, { fields });
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest, { params }: { params: Promise<{ eiaId: string }> }) {
  const { eiaId } = await params;
  return handler(req, { params: { eiaId }, requestId: generateRequestId() });
}
