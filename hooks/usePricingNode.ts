/**
 * usePricingNode — Client hook for fetching a single pricing node by slug
 *
 * Uses SWR to fetch from /api/v1/pricing-nodes/:slug.
 * Returns { pricingNode, isLoading, error, mutate }
 */

import useSWR from "swr";

import type { PricingNode } from "@/types/pricing-nodes";

interface UsePricingNodeResult {
  pricingNode: PricingNode | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<PricingNode> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Pricing node not found");
    }
    throw new Error(`Failed to fetch pricing node: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function usePricingNode(slug: string | null | undefined): UsePricingNodeResult {
  const { data, error, mutate } = useSWR<PricingNode>(slug ? `/api/v1/pricing-nodes/${slug}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (pricing node metadata doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    pricingNode: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
