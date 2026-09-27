/**
 * useRate — Client hook for fetching a single rate structure by slug
 *
 * Uses SWR to fetch from /api/v1/rates/:slug.
 * Returns { rate, isLoading, error, mutate }
 */

import useSWR from "swr";

import type { RateStructure } from "@/types/rate-structures";

interface UseRateResult {
  rate: RateStructure | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<RateStructure> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Rate not found");
    }
    throw new Error(`Failed to fetch rate: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function useRate(slug: string | null | undefined): UseRateResult {
  const { data, error, mutate } = useSWR<RateStructure>(slug ? `/api/v1/rates/${slug}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (rate data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    rate: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
