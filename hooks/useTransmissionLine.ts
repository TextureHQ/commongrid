/**
 * useTransmissionLine — Client hook for fetching a single transmission line by slug
 *
 * Uses SWR to fetch from /api/v1/transmission-lines/:slug.
 * Returns { transmissionLine, isLoading, error, mutate }
 */

import useSWR from "swr";

import type { TransmissionLine } from "@/types/transmission-lines";

interface UseTransmissionLineResult {
  transmissionLine: TransmissionLine | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<TransmissionLine> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Transmission line not found");
    }
    throw new Error(`Failed to fetch transmission line: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function useTransmissionLine(slug: string | null | undefined): UseTransmissionLineResult {
  const { data, error, mutate } = useSWR<TransmissionLine>(
    slug ? `/api/v1/transmission-lines/${slug}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Cache for 24 hours (transmission line data doesn't change often)
      dedupingInterval: 86_400_000,
    }
  );

  return {
    transmissionLine: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
