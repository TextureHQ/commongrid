/**
 * useRtoList — Client hook for fetching a filtered list of RTOs
 *
 * Uses SWR to fetch from /api/v1/rtos with query parameters.
 * Returns { rtos, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { Rto } from "@/types/entities";

interface RtoListFilters {
  state?: string;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface RtoListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface RtoListResponse {
  data: Rto[];
  pagination: RtoListPagination;
}

interface UseRtoListResult {
  rtos: Rto[];
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: RtoListPagination | null;
}

const fetcher = async (url: string): Promise<RtoListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch RTOs: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: RtoListFilters): string {
  const params = new URLSearchParams();

  if (filters.state) params.set("state", filters.state);
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function useRtoList(filters: RtoListFilters = {}): UseRtoListResult {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/rtos${queryString ? `?${queryString}` : ""}`;

  const { data, error, mutate } = useSWR<RtoListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (RTO data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    rtos: data?.data ?? [],
    isLoading: !data && !error,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? null,
  };
}
