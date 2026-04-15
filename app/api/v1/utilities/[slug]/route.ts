import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { getDb } from "@/lib/db/client";
import {
  utilities,
  isos,
  rtos,
  balancingAuthorities,
} from "@/lib/db/schema";
import {
  withRequestId,
  withErrorHandling,
  withTiming,
  generateRequestId,
} from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import type { RouteContext } from "@/lib/api/types";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/v1/utilities/[slug] — Get utility by slug with optional includes
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const url = new URL(req.url);
  const include = url.searchParams.get("include");
  const source = getDataSource("utilities");

  if (source === "json") {
    return handleJsonDetail(slug, include);
  }

  return handleDatabaseDetail(slug, include);
}

// ---------------------------------------------------------------------------
// JSON mode
// ---------------------------------------------------------------------------

async function handleJsonDetail(slug: string, include: string | null) {
  const allUtilities = (await import("@/data/utilities.json")).default;
  const utility = allUtilities.find(
    (u: { slug: string }) => u.slug === slug
  );

  if (!utility) {
    throw new ApiError("NOT_FOUND", `Utility '${slug}' not found`);
  }

  if (include) {
    const includes = include.split(",").map((i) => i.trim());
    const result: Record<string, unknown> = { ...utility };

    if (includes.includes("iso") && utility.isoId) {
      const allIsos = (await import("@/data/isos.json")).default;
      result._iso =
        allIsos.find(
          (i: { id: string }) => i.id === utility.isoId
        ) ?? null;
    }
    if (includes.includes("rto") && utility.rtoId) {
      const allRtos = (await import("@/data/rtos.json")).default;
      result._rto =
        allRtos.find(
          (r: { id: string }) => r.id === utility.rtoId
        ) ?? null;
    }
    if (includes.includes("ba") && utility.balancingAuthorityId) {
      const allBAs = (
        await import("@/data/balancing-authorities.json")
      ).default;
      result._ba =
        allBAs.find(
          (b: { id: string }) =>
            b.id === utility.balancingAuthorityId
        ) ?? null;
    }

    return jsonResponse({ data: result }, 200, corsHeaders());
  }

  return jsonResponse({ data: utility }, 200, corsHeaders());
}

// ---------------------------------------------------------------------------
// Database mode
// ---------------------------------------------------------------------------

async function handleDatabaseDetail(slug: string, include: string | null) {
  const db = getDb();
  const [utility] = await db
    .select()
    .from(utilities)
    .where(eq(utilities.slug, slug))
    .limit(1);

  if (!utility) {
    throw new ApiError("NOT_FOUND", `Utility '${slug}' not found`);
  }

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
          .where(
            eq(
              balancingAuthorities.id,
              utility.balancingAuthorityId
            )
          )
          .limit(1)
          .then(([ba]) => {
            result._ba = ba ?? null;
          })
      );
    }

    await Promise.all(fetches);
    return jsonResponse({ data: result }, 200, corsHeaders());
  }

  return jsonResponse({ data: utility }, 200, corsHeaders());
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
