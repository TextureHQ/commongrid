/**
 * useUtilityNames — Resolve a set of utility slugs to display names.
 *
 * Why this exists: several views hold a handful of utility *slugs* (program
 * administrators, plant owners) and need the human-readable name. The old
 * pattern was `useUtilityList({ limit: 200 })` plus a client-side
 * `utilities.find(...)`, which fetched the first 200 of 3,133 utilities
 * alphabetically. Any slug past that cap resolved to nothing, so program
 * panels rendered no utility at all (real case: "AC Load Management",
 * administered by `central-georgia-el-member`).
 *
 * This hook asks the API for exactly the slugs it needs via
 * `GET /api/v1/utilities?slugs=…&fields=id,slug,name`, chunked to stay under
 * the endpoint's `limit` cap so an unbounded slug set (e.g. an infinite-scroll
 * list that has paged in 600 programs) still resolves completely.
 */

import { useMemo } from "react";
import useSWR from "swr";

import type { Utility } from "@/types/entities";

/** Max rows the utilities list endpoint returns per request. */
const CHUNK_SIZE = 200;

export interface UtilityNameEntry {
  slug: string;
  name: string;
  id: string;
}

interface UseUtilityNamesResult {
  /** slug → utility (only slugs that resolved to a real, non-deleted row). */
  utilitiesBySlug: Map<string, UtilityNameEntry>;
  isLoading: boolean;
  error: Error | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

const fetcher = async (key: string): Promise<UtilityNameEntry[]> => {
  // The SWR key is a "\n"-joined list of URLs so a multi-chunk request stays a
  // single cache entry and a single loading state.
  const urls = key.split("\n").filter((u) => u.length > 0);

  const responses = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch utility names: ${res.statusText}`);
      }
      return (await res.json()) as { data: Utility[] };
    })
  );

  const entries: UtilityNameEntry[] = [];
  for (const body of responses) {
    for (const u of body.data ?? []) {
      entries.push({ id: u.id, slug: u.slug, name: u.name });
    }
  }
  return entries;
};

export function useUtilityNames(slugs: string[]): UseUtilityNamesResult {
  // Sort + de-duplicate so callers can pass a freshly-mapped array on every
  // render without churning the SWR cache key.
  const normalized = useMemo(() => [...new Set(slugs.filter((s) => !!s))].sort(), [slugs]);

  const swrKey = useMemo(() => {
    if (normalized.length === 0) return null;
    return chunk(normalized, CHUNK_SIZE)
      .map((group) => `/api/v1/utilities?slugs=${encodeURIComponent(group.join(","))}&fields=id,slug,name&limit=200`)
      .join("\n");
  }, [normalized]);

  const { data, error } = useSWR<UtilityNameEntry[]>(swrKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
    // Names change rarely; cache for an hour like the other utility hooks.
    dedupingInterval: 3_600_000,
  });

  const utilitiesBySlug = useMemo(() => {
    const map = new Map<string, UtilityNameEntry>();
    for (const entry of data ?? []) map.set(entry.slug, entry);
    return map;
  }, [data]);

  return {
    utilitiesBySlug,
    isLoading: !data && !error && swrKey !== null,
    error: error ?? null,
  };
}
