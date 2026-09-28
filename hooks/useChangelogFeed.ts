"use client";

/**
 * useChangelogFeed / useChangelogCounters — the homepage activity ledger's data.
 *
 * Both read `GET /api/v1/changelog`, the database-backed feed the `/changelog`
 * page renders. The counters use the endpoint's `since` filter plus `limit=1`
 * so each window costs one count query rather than pulling the rows.
 */

import { useMemo } from "react";
import useSWR from "swr";

import { type LedgerRow, toLedgerRows } from "@/lib/changelog/ledger";
import type { ChangelogEntry } from "@/types/changelog";

interface ChangelogResponse {
  entries: ChangelogEntry[];
  total: number;
  hasMore: boolean;
  source: "database" | "static";
}

const fetcher = async (url: string): Promise<ChangelogResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load changelog (${res.status})`);
  return (await res.json()) as ChangelogResponse;
};

const SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  // The feed itself is cached for 60s at the edge; matching that here keeps a
  // homepage remount from re-requesting it.
  dedupingInterval: 60_000,
} as const;

export interface ChangelogFeedResult {
  rows: LedgerRow[];
  isLoading: boolean;
  error: Error | null;
}

export function useChangelogFeed(limit = 8): ChangelogFeedResult {
  const { data, error, isLoading } = useSWR<ChangelogResponse>(
    `/api/v1/changelog?limit=${limit}`,
    fetcher,
    SWR_OPTIONS
  );

  const rows = useMemo(() => toLedgerRows(data?.entries ?? []), [data]);

  return { rows, isLoading: isLoading && !data, error: (error as Error) ?? null };
}

function sinceIso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

export interface ChangelogCounters {
  day: number | null;
  week: number | null;
}

export function useChangelogCounters(): ChangelogCounters {
  // Bucket `since` to the hour so the SWR keys are stable across renders
  // instead of changing on every millisecond of clock drift.
  const { day, week } = useMemo(() => {
    const hour = 3_600_000;
    const bucket = Math.floor(Date.now() / hour) * hour;
    return {
      day: new Date(bucket - 24 * hour).toISOString(),
      week: new Date(bucket - 7 * 24 * hour).toISOString(),
    };
  }, []);

  const dayResult = useSWR<ChangelogResponse>(
    `/api/v1/changelog?limit=1&since=${encodeURIComponent(day)}`,
    fetcher,
    SWR_OPTIONS
  );
  const weekResult = useSWR<ChangelogResponse>(
    `/api/v1/changelog?limit=1&since=${encodeURIComponent(week)}`,
    fetcher,
    SWR_OPTIONS
  );

  return {
    day: typeof dayResult.data?.total === "number" ? dayResult.data.total : null,
    week: typeof weekResult.data?.total === "number" ? weekResult.data.total : null,
  };
}

export { sinceIso };
