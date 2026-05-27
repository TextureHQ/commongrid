/**
 * useRto — Client hook for fetching a single RTO by slug
 *
 * Uses SWR to fetch from /api/v1/rtos/:slug.
 * Returns { rto, isLoading, error, mutate }
 */

import useSWR from "swr";

interface Rto {
  id: string;
  slug: string;
  name: string;
  [key: string]: unknown;
}

interface UseRtoResult {
  rto: Rto | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<Rto> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("RTO not found");
    }
    throw new Error(`Failed to fetch RTO: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function useRto(slug: string | null | undefined): UseRtoResult {
  const { data, error, mutate } = useSWR<Rto>(slug ? `/api/v1/rtos/${slug}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (RTO data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    rto: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
