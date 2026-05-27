/**
 * useIso — Client hook for fetching a single ISO by slug
 *
 * Uses SWR to fetch from /api/v1/isos/:slug.
 * Returns { iso, isLoading, error, mutate }
 */

import useSWR from "swr";

interface Iso {
  id: string;
  slug: string;
  name: string;
  [key: string]: unknown;
}

interface UseIsoResult {
  iso: Iso | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<Iso> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("ISO not found");
    }
    throw new Error(`Failed to fetch ISO: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function useIso(slug: string | null | undefined): UseIsoResult {
  const { data, error, mutate } = useSWR<Iso>(slug ? `/api/v1/isos/${slug}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (ISO data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    iso: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
