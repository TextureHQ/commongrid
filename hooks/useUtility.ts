/**
 * useUtility — Client hook for fetching a single utility by slug
 *
 * Uses SWR to fetch from /api/v1/utilities/:slug.
 * Returns { utility, isLoading, error, mutate }
 *
 * Note: The API handles successor-following automatically. If a utility has been
 * merged/acquired, the API transparently returns the successor's data with a
 * _redirected_from field documenting the original slug.
 */

import useSWR from "swr";

import type { Utility } from "@/types/entities";

interface UseUtilityResult {
  utility: Utility | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<Utility> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Utility not found");
    }
    throw new Error(`Failed to fetch utility: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function useUtility(slug: string | null | undefined): UseUtilityResult {
  const { data, error, mutate } = useSWR<Utility>(slug ? `/api/v1/utilities/${slug}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 1 hour (utility data changes occasionally)
    dedupingInterval: 3_600_000,
  });

  return {
    utility: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
