/**
 * useRateList — Client hook for fetching a filtered list of rate structures.
 *
 * Uses SWR to fetch from /api/v1/rates with query parameters.
 * Returns { rates, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { RateStructure } from "@/types/rate-structures";

interface RateListFilters {
  search?: string;
  sector?: string;
  utilityId?: string;
  eiaId?: number;
  hasTou?: boolean;
  hasDemandCharge?: boolean;
  hasNetMetering?: boolean;
  isEvRate?: boolean;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
  enabled?: boolean;
}

interface RateListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface RateListResponse {
  data: RateStructure[];
  pagination: RateListPagination;
}

interface UseRateListResult {
  rates: RateStructure[];
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: RateListPagination | null;
}

const fetcher = async (url: string): Promise<RateListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch rates: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: RateListFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.sector) params.set("sector", filters.sector);
  if (filters.utilityId) params.set("utilityId", filters.utilityId);
  if (filters.eiaId !== undefined) params.set("eiaId", filters.eiaId.toString());
  if (typeof filters.hasTou === "boolean") params.set("hasTou", filters.hasTou ? "true" : "false");
  if (typeof filters.hasDemandCharge === "boolean")
    params.set("hasDemandCharge", filters.hasDemandCharge ? "true" : "false");
  if (typeof filters.hasNetMetering === "boolean")
    params.set("hasNetMetering", filters.hasNetMetering ? "true" : "false");
  if (typeof filters.isEvRate === "boolean") params.set("isEvRate", filters.isEvRate ? "true" : "false");
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function useRateList(filters: RateListFilters = {}): UseRateListResult {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/rates${queryString ? `?${queryString}` : ""}`;

  const { data, error, mutate } = useSWR<RateListResponse>(filters.enabled === false ? null : url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 1 hour (rate data doesn't change often)
    dedupingInterval: 3_600_000,
  });

  return {
    rates: data?.data ?? [],
    isLoading: !data && !error && filters.enabled !== false,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? null,
  };
}
