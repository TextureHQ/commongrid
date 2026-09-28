/**
 * useRegionList — Client hook for fetching regions from the DB-backed API.
 *
 * Uses SWR to fetch from /api/v1/regions. Replaces the old synchronous
 * getRegionById/getRegionByEiaId helpers in lib/data.ts that read the
 * statically-imported ~950 KB data/regions.json (bundled on cold start).
 *
 * The list endpoint caps `limit` at 200, but there are ~3,000 regions. A
 * single high-limit fetch would silently return only the first 200 rows,
 * leaving the lookup maps incomplete and breaking region resolution on every
 * surface that migrated off getRegionById(). So this hook follows the cursor
 * until the endpoint reports no more pages — the same pattern useAllPrograms
 * uses — reproducing what the old synchronous full-array helpers did.
 *
 * Returns the region array plus id→Region and eiaId→Region lookup maps so
 * callers that previously did getRegionById(id) can do regionById.get(id).
 */

import { useMemo } from "react";
import useSWR from "swr";
import type { Region } from "@/types/entities";

const PAGE_SIZE = 200;

interface RegionListFilters {
  type?: string;
  state?: string;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  /** Set false to hold the request. */
  enabled?: boolean;
}

interface RegionsPage {
  data: Region[];
  pagination: { cursor: string | null; hasMore: boolean };
}

interface UseRegionListResult {
  regions: Region[];
  /** id → Region lookup (replaces getRegionById). */
  regionById: Map<string, Region>;
  /** eiaId → Region lookup (replaces getRegionByEiaId). */
  regionByEiaId: Map<string, Region>;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

function buildQueryParams(filters: RegionListFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.state) params.set("state", filters.state);
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  params.set("limit", PAGE_SIZE.toString());
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

async function fetchAllRegions(filters: RegionListFilters): Promise<Region[]> {
  const all: Region[] = [];
  let cursor: string | null = null;

  // Follow the cursor until the endpoint reports no more pages. Bounded by a
  // hard page cap as a safety valve against a pathological cursor loop
  // (~3k regions / 200 per page = ~15 pages; 100 is generous headroom).
  for (let page = 0; page < 100; page++) {
    const res = await fetch(`/api/v1/regions?${buildQueryParams(filters, cursor)}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch regions: ${res.statusText}`);
    }
    const json: RegionsPage = await res.json();
    all.push(...json.data);

    cursor = json.pagination?.cursor ?? null;
    if (!cursor || !json.pagination?.hasMore) break;
  }

  return all;
}

export function useRegionList(filters: RegionListFilters = {}): UseRegionListResult {
  const { enabled = true, ...rest } = filters;
  const key = enabled
    ? ["all-regions", rest.type ?? "", rest.state ?? "", rest.fields ?? "", rest.sort ?? "", rest.order ?? ""]
    : null;

  const { data, error, mutate } = useSWR<Region[]>(key, () => fetchAllRegions(rest), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Region data changes rarely; cache for 24 hours.
    dedupingInterval: 86_400_000,
  });

  const regions = data ?? [];

  const { regionById, regionByEiaId } = useMemo(() => {
    const byId = new Map<string, Region>();
    const byEiaId = new Map<string, Region>();
    for (const r of regions) {
      byId.set(r.id, r);
      if (r.eiaId) byEiaId.set(r.eiaId, r);
    }
    return { regionById: byId, regionByEiaId: byEiaId };
  }, [regions]);

  return {
    regions,
    regionById,
    regionByEiaId,
    isLoading: !data && !error,
    error: error ?? null,
    mutate,
  };
}
