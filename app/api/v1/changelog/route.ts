import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import changelogJson from "@/data/changelog.json";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { entityVersions } from "@/lib/db/schema/entity-versions";
import type { ChangelogEntry } from "@/types/changelog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map entity_versions.changeType → ChangelogEntry.kind */
function mapChangeType(changeType: string): "updated" | "added" {
  return changeType === "create" ? "added" : "updated";
}

/** Human-readable label for entity types */
function entityTypeLabel(entityType: string): string {
  const labels: Record<string, string> = {
    utility: "Utility",
    iso: "ISO",
    rto: "RTO",
    "balancing-authority": "Grid Op",
    power_plant: "Power Plant",
    ev_station: "EV Station",
    transmission_line: "Transmission",
    pricing_node: "Pricing Node",
    program: "Program",
  };
  return labels[entityType] ?? entityType;
}

// ---------------------------------------------------------------------------
// Static fallback — serves data/changelog.json when entity_versions is empty
// ---------------------------------------------------------------------------

function buildStaticResponse(params: {
  limit: number;
  offset: number;
  entityType: string | null;
  since: string | null;
  kind: string | null;
}) {
  const { limit, offset, entityType, since, kind } = params;

  let entries: ChangelogEntry[] = [
    ...(changelogJson.recentlyUpdated as ChangelogEntry[]),
    ...(changelogJson.newlyAdded as ChangelogEntry[]),
  ];

  entries.sort((a, b) => new Date(b.isoTimestamp).getTime() - new Date(a.isoTimestamp).getTime());

  if (entityType) {
    entries = entries.filter((e) => e.entityType === entityType);
  }
  if (since) {
    const sinceDate = new Date(since).getTime();
    entries = entries.filter((e) => new Date(e.isoTimestamp).getTime() >= sinceDate);
  }
  if (kind) {
    entries = entries.filter((e) => e.kind === kind);
  }

  const total = entries.length;
  const paged = entries.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return { entries: paged, total, hasMore, source: "static" as const };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleGet(req: Request, _ctx: RouteContext) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const entityType = url.searchParams.get("entity_type");
  const since = url.searchParams.get("since");
  const kind = url.searchParams.get("kind");

  const cors = corsHeaders();

  // Try database first
  const db = getDb();
  if (db) {
    try {
      const conditions = [];
      if (entityType) conditions.push(eq(entityVersions.entityType, entityType));
      if (since) conditions.push(gte(entityVersions.changedAt, new Date(since)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const countResult = await db.select({ count: sql<number>`count(*)` }).from(entityVersions).where(where);

      const total = Number(countResult[0]?.count ?? 0);

      if (total > 0) {
        const rows = await db
          .select()
          .from(entityVersions)
          .where(where)
          .orderBy(desc(entityVersions.changedAt))
          .limit(limit)
          .offset(offset);

        const entries: ChangelogEntry[] = rows.map((row) => ({
          kind: mapChangeType(row.changeType),
          entityType: row.entityType as ChangelogEntry["entityType"],
          entityTypeLabel: entityTypeLabel(row.entityType),
          name: row.changeSummary ?? `${row.entityType} ${row.entityId}`,
          slug: row.entityId,
          detail: row.changeSummary ?? `Version ${row.versionNumber}`,
          isoTimestamp: (row.changedAt ?? new Date()).toISOString(),
        }));

        return jsonResponse({ entries, total, hasMore: offset + limit < total, source: "database" }, 200, {
          ...cors,
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        });
      }
    } catch {
      // Database unavailable or empty — fall through to static
    }
  }

  // Fallback to static data
  const result = buildStaticResponse({ limit, offset, entityType, since, kind });
  return jsonResponse(result, 200, { ...cors, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" });
}

// ---------------------------------------------------------------------------
// Export with middleware
// ---------------------------------------------------------------------------

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
