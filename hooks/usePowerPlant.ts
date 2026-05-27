/**
 * usePowerPlant — Client hook for fetching a single power plant by slug
 *
 * Uses SWR to fetch from /api/v1/power-plants/:slug.
 * Returns { powerPlant, isLoading, error, mutate }
 */

import useSWR from "swr";

import type { PowerPlant } from "@/types/entities";

interface UsePowerPlantResult {
  powerPlant: PowerPlant | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<PowerPlant> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Power plant not found");
    }
    throw new Error(`Failed to fetch power plant: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function usePowerPlant(slug: string | null | undefined): UsePowerPlantResult {
  const { data, error, mutate } = useSWR<PowerPlant>(slug ? `/api/v1/power-plants/${slug}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (power plant data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    powerPlant: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
