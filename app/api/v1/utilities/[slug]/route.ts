import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { parseAtParam, pointInTimeJsonResponse } from "@/lib/api/point-in-time";
import { publicJsonResponse } from "@/lib/api/public-response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { balancingAuthorities, isos, rtos, utilities } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/utilities/[slug] — Get utility by slug with optional includes
//
// Successor-following behaviour
// -----------------------------
// When the row matched by `slug` has `status` in {MERGED, ACQUIRED} and a
// non-null `successor_id`, we return the *successor* row's data instead of
// the deprecated stub. This preserves the contract that historic slugs
// remain stable, addressable URLs while consumers transparently receive the
// live canonical record (matching EIA-861 + post-merge data, populated
// `eia_id`, etc.).
//
// To make the redirect observable for clients that need it, we add:
//   - `_redirected_from`: an object describing the deprecated slug, status,
//      and reason so consumers can audit, log, or update their references.
//   - HTTP `Link: </api/v1/utilities/{successor_slug}>; rel="canonical"`
//     header so cache layers, tools, and crawlers can pick it up.
//
// We deliberately do *not* return an HTTP 301/308 redirect: many consumers
// (including server-side ETL pipelines and the Relay NISC matcher) rely on
// the response body being available at the original URL, and a redirect
// would force them to follow a second request.
// ---------------------------------------------------------------------------

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

const REDIRECT_STATUSES = new Set(["MERGED", "ACQUIRED"]);

interface UtilityRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  successorId: string | null;
  isoId: string | null;
  rtoId: string | null;
  balancingAuthorityId: string | null;
  deprecationReason: string | null;
  [key: string]: unknown;
}

interface RedirectMeta {
  from_slug: string;
  from_status: string;
  reason: string | null;
}

async function handleGet(req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const url = new URL(req.url);
  const include = url.searchParams.get("include");
  const fields = url.searchParams.get("fields");
  const at = parseAtParam(url.searchParams);
  // Opt-out: `?follow_successor=false` returns the deprecated stub verbatim
  // (useful for forensic / audit consumers who need to see the original row).
  // Point-in-time reads never follow successors — they return the slug's own history.
  const followSuccessor = !at && url.searchParams.get("follow_successor") !== "false";

  const db = getDb();
  const [initial] = (await db.select().from(utilities).where(eq(utilities.slug, slug)).limit(1)) as unknown as [
    UtilityRow | undefined,
  ];

  if (!initial) {
    throw new ApiError("NOT_FOUND", `Utility '${slug}' not found`);
  }

  if (at) {
    return pointInTimeJsonResponse({
      entityType: "utility",
      entityId: initial.id,
      at,
      label: "Utility",
      slug,
      headers: { "Cache-Control": CACHE_CONTROL, "Cache-Tag": `utility:${slug}` },
      fields,
    });
  }

  let utility: UtilityRow = initial;
  let redirected: RedirectMeta | null = null;
  const extraHeaders: Record<string, string> = { "Cache-Control": CACHE_CONTROL };

  // Follow successor chain. We bound depth at MAX_HOPS to avoid pathological
  // cycles even though the data model doesn't permit them today.
  if (followSuccessor && REDIRECT_STATUSES.has(initial.status) && initial.successorId) {
    const MAX_HOPS = 5;
    let current: UtilityRow = initial;
    const visited = new Set<string>([current.id]);

    for (let hop = 0; hop < MAX_HOPS; hop += 1) {
      if (!REDIRECT_STATUSES.has(current.status) || !current.successorId) break;

      const [next] = (await db
        .select()
        .from(utilities)
        .where(eq(utilities.id, current.successorId))
        .limit(1)) as unknown as [UtilityRow | undefined];

      if (!next || next.id === current.id || visited.has(next.id)) break;
      visited.add(next.id);
      current = next;
    }

    if (current.id !== initial.id) {
      utility = current;
      redirected = {
        from_slug: initial.slug,
        from_status: initial.status,
        reason: initial.deprecationReason ?? null,
      };
      extraHeaders.Link = `</api/v1/utilities/${current.slug}>; rel="canonical"`;
    }
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
          .where(eq(balancingAuthorities.id, utility.balancingAuthorityId))
          .limit(1)
          .then(([ba]) => {
            result._ba = ba ?? null;
          })
      );
    }

    await Promise.all(fetches);
    if (redirected) result._redirected_from = redirected;
    return publicJsonResponse(result, 200, extraHeaders, { fields });
  }

  if (redirected) {
    return publicJsonResponse({ ...utility, _redirected_from: redirected }, 200, extraHeaders, { fields });
  }

  return publicJsonResponse(utility, 200, extraHeaders, { fields });
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
