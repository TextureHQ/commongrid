/**
 * useProgram — Client hook for fetching a single program by slug
 *
 * Uses SWR to fetch from /api/v1/programs/:slug.
 * Returns { program, isLoading, error, mutate }
 */

import useSWR from "swr";

import type { Program } from "@/types/programs";

interface UseProgramResult {
  program: Program | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<Program> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Program not found");
    }
    throw new Error(`Failed to fetch program: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function useProgram(slug: string | null | undefined): UseProgramResult {
  const { data, error, mutate } = useSWR<Program>(slug ? `/api/v1/programs/${slug}` : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (programs don't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    program: data ?? null,
    isLoading: !data && !error && !!slug,
    error: error ?? null,
    mutate,
  };
}
