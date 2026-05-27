/**
 * useBalancingAuthority — Client hook for fetching a single balancing authority by slug
 *
 * Uses SWR to fetch from /api/v1/balancing-authorities/:slug.
 * Returns { balancingAuthority, isLoading, error, mutate }
 */

import useSWR from "swr";

interface BalancingAuthority {
  id: string;
  slug: string;
  name: string;
  [key: string]: unknown;
}

interface UseBalancingAuthorityResult {
  balancingAuthority: BalancingAuthority | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<BalancingAuthority> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Balancing authority not found");
    }
    throw new Error(`Failed to fetch balancing authority: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function useBalancingAuthority(slug: string | null | undefined): UseBalancingAuthorityResult {
  const { data, error, mutate } = useSWR<BalancingAuthority>(
    slug ? `/api/v1/balancing-authorities/${slug}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Cache for 24 hours (BA data doesn't change often)
      dedupingInterval: 86_400_000,
    }
  );

  return {
    balancingAuthority: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
