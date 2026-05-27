/**
 * useProgramList — Client hook for fetching a filtered/sorted list of programs
 *
 * Uses SWR to fetch from /api/v1/programs with query parameters.
 * Returns { programs, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { Program } from "@/types/programs";

interface ProgramListFilters {
  status?: string;
  assetType?: string;
  marketSegment?: string;
  gridService?: string;
  search?: string;
  fields?: string;
  sort?: "name" | "status";
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface ProgramListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface ProgramListResponse {
  data: Program[];
  pagination: ProgramListPagination;
}

interface UseProgramListResult {
  programs: Program[];
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: ProgramListPagination | null;
}

const fetcher = async (url: string): Promise<ProgramListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch programs: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: ProgramListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) params.set("status", filters.status);
  if (filters.assetType) params.set("assetType", filters.assetType);
  if (filters.marketSegment) params.set("marketSegment", filters.marketSegment);
  if (filters.gridService) params.set("gridService", filters.gridService);
  if (filters.search) params.set("search", filters.search);
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function useProgramList(filters: ProgramListFilters = {}): UseProgramListResult {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/programs${queryString ? `?${queryString}` : ""}`;

  const { data, error, mutate } = useSWR<ProgramListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (programs don't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    programs: data?.data ?? [],
    isLoading: !data && !error,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? null,
  };
}
