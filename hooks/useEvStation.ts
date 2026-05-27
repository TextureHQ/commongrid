/**
 * useEvStation — Client hook for fetching a single EV charging station by slug
 *
 * Uses SWR to fetch from /api/v1/ev-stations/:slug.
 * Returns { evStation, isLoading, error, mutate }
 */

import useSWR from "swr";

import type { EVStation } from "@/types/ev-charging";

interface UseEvStationResult {
  evStation: EVStation | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<EVStation> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("EV station not found");
    }
    throw new Error(`Failed to fetch EV station: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function useEvStation(slug: string | null | undefined): UseEvStationResult {
  const { data, error, mutate } = useSWR<EVStation>(slug ? `/api/v1/ev-stations/${slug}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (EV station data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    evStation: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
