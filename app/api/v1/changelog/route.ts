import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
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

/** One row of the unioned feed: either a collapsed batch or a lone version. */
interface FeedRow {
  row_kind: "batch" | "version";
  key: string;
  name: string;
  source_type: string | null;
  item_count: number | string;
  ts: string | Date;
  entity_type: string | null;
  slug: string | null;
  summary: string | null;
  change_type: string | null;
}

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
      // The feed is a union of two things: one row per change_batch, and one
      // row per version that belongs to no batch.
      //
      // Batches exist because a single operation can write thousands of
      // versions. A monthly EIA sync produces one entry reading
      // "EIA-861 sync · 12,431 records" instead of 12,431 rows that bury every
      // community edit made that month. The backfill already proved the failure
      // mode: 166k baseline rows flooded this feed.
      //
      // Baselines stay excluded on both sides. They record the state an entity
      // was already in — what makes history reconstructable, not an event where
      // anyone changed anything.
      const typeFilter = entityType ? sql`and v.entity_type = ${entityType}` : sql``;
      const sinceFilter = since ? sql`and v.changed_at >= ${new Date(since)}` : sql``;
      const batchSinceFilter = since ? sql`and b.started_at >= ${new Date(since)}` : sql``;

      const feed = sql`
        with feed as (
          select
            'batch'                  as row_kind,
            b.id                     as key,
            b.title                  as name,
            b.source_type            as source_type,
            -- Counted live rather than read from b.version_count. That column is
            -- maintained by writers and drifts if a batch is interrupted, and a
            -- feed that misreports how many records an operation touched is
            -- worse than a slower one. idx_ev_batch is partial on batch_id and
            -- exists for exactly this lookup.
            (select count(*) from entity_versions v
              where v.batch_id = b.id and v.change_type <> 'baseline') as item_count,
            b.started_at             as ts,
            (select v.entity_type from entity_versions v
              where v.batch_id = b.id ${typeFilter}
              group by v.entity_type order by count(*) desc limit 1) as entity_type,
            null::text               as slug,
            null::text               as summary,
            null::text               as change_type
          from change_batches b
          where exists (
            select 1 from entity_versions v
            where v.batch_id = b.id and v.change_type <> 'baseline' ${typeFilter}
          ) ${batchSinceFilter}
          union all
          select
            'version', v.id::text, coalesce(v.entity_name, v.entity_type || ' ' || v.entity_id),
            v.source_type, 1, v.changed_at, v.entity_type,
            coalesce(v.entity_slug, v.entity_id), v.change_summary, v.change_type
          from entity_versions v
          where v.batch_id is null and v.change_type <> 'baseline' ${typeFilter} ${sinceFilter}
        )
        select * from feed order by ts desc limit ${limit} offset ${offset}
      `;

      const countQuery = sql`
        select
          (select count(*) from change_batches b where exists (
            select 1 from entity_versions v
            where v.batch_id = b.id and v.change_type <> 'baseline' ${typeFilter}
          ) ${batchSinceFilter})
          +
          (select count(*) from entity_versions v
            where v.batch_id is null and v.change_type <> 'baseline' ${typeFilter} ${sinceFilter})
          as count
      `;

      const countResult = await db.execute(countQuery);
      const total = Number((countResult.rows[0] as { count: string | number })?.count ?? 0);

      if (total > 0) {
        const { rows } = await db.execute(feed);

        const entries: ChangelogEntry[] = (rows as unknown as FeedRow[]).map((row) => {
          const isBatch = row.row_kind === "batch";
          const type = row.entity_type ?? "utility";
          return {
            // 'synced' already exists on ChangelogOperation and is what a
            // machine-run batch is; community batches read as 'updated'.
            kind: isBatch && row.source_type === "sync" ? "synced" : mapChangeType(row.change_type ?? "update"),
            entityType: type as ChangelogEntry["entityType"],
            entityTypeLabel: entityTypeLabel(type),
            name: row.name,
            slug: row.slug ?? row.key,
            detail: isBatch ? `${Number(row.item_count).toLocaleString()} records` : (row.summary ?? "Updated"),
            isoTimestamp: new Date(row.ts).toISOString(),
            ...(row.source_type ? { source: row.source_type } : {}),
          };
        });

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
