/**
 * useIsoList — Client hook for fetching a filtered list of ISOs
 *
 * Uses SWR to fetch from /api/v1/isos with query parameters.
 * Returns { isos, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { Iso } from "@/types/entities";

interface IsoListFilters {
  state?: string;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface IsoListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface IsoListResponse {
  data: Iso[];
  pagination: IsoListPagination;
}

interface UseIsoListResult {
  isos: Iso[];
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: IsoListPagination | null;
}

const fetcher = async (url: string): Promise<IsoListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ISOs: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: IsoListFilters): string {
  const params = new URLSearchParams();

  if (filters.state) params.set("state", filters.state);
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function useIsoList(filters: IsoListFilters = {}): UseIsoListResult {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/isos${queryString ? `?${queryString}` : ""}`;

  const { data, error, mutate } = useSWR<IsoListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (ISO data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    isos: data?.data ?? [],
    isLoading: !data && !error,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? null,
  };
}
