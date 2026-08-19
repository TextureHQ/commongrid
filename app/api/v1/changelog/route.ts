/**
 * GET /api/v1/changelog
 *
 * Recent changes across every entity type. The query itself lives in
 * lib/data/changelog-feed.ts so the changelog page can render the same feed on
 * the server rather than fetching this endpoint from the browser.
 */

import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { parseOptionalEnumParam } from "@/lib/api/validation";
import { fetchChangelogFeed } from "@/lib/data/changelog-feed";
import type { ChangelogOperation } from "@/types/changelog";

const CHANGELOG_KIND_VALUES: readonly ChangelogOperation[] = ["updated", "added", "corrected", "synced"];

async function handleGet(req: Request, _ctx: RouteContext) {
  const url = new URL(req.url);

  const feed = await fetchChangelogFeed({
    limit: Number(url.searchParams.get("limit")) || 50,
    offset: Number(url.searchParams.get("offset")) || 0,
    entityType: url.searchParams.get("entity_type"),
    since: url.searchParams.get("since"),
    kind: parseOptionalEnumParam(
      url.searchParams.get("kind"),
      CHANGELOG_KIND_VALUES,
      "kind"
    ) as ChangelogOperation | null,
  });

  // Static and database feeds cache differently: the static one is a build
  // artifact and can sit for an hour, the database one should reflect a
  // contribution approved a minute ago.
  const cacheControl =
    feed.source === "database"
      ? "public, s-maxage=60, stale-while-revalidate=300"
      : "public, s-maxage=300, stale-while-revalidate=3600";

  return jsonResponse(feed, 200, { ...corsHeaders(), "Cache-Control": cacheControl });
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
