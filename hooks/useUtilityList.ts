/**
 * useUtilityList — Client hook for fetching a filtered/sorted list of utilities
 *
 * Uses SWR to fetch from /api/v1/utilities with query parameters.
 * Returns { utilities, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { Utility } from "@/types/entities";

interface UtilityListFilters {
  segment?: string;
  status?: string;
  state?: string;
  iso?: string;
  rto?: string;
  ba?: string;
  search?: string;
  hasGeneration?: boolean;
  hasTransmission?: boolean;
  hasDistribution?: boolean;
  eiaIds?: string[];
  slugs?: string[];
  minCustomers?: number;
  maxCustomers?: number;
  minAmiMeters?: number;
  minTotalMeters?: number;
  hasLogo?: boolean;
  hasWebsite?: boolean;
  hasTerritory?: boolean;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface UtilityListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface UtilityListResponse {
  data: Utility[];
  pagination: UtilityListPagination;
}

interface UseUtilityListResult {
  utilities: Utility[];
  isLoading: boolean;
  isValidating: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: UtilityListPagination | null;
}

const fetcher = async (url: string): Promise<UtilityListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch utilities: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: UtilityListFilters): string {
  const params = new URLSearchParams();

  if (filters.segment) params.set("segment", filters.segment);
  if (filters.status) params.set("status", filters.status);
  if (filters.state) params.set("state", filters.state);
  if (filters.iso) params.set("iso", filters.iso);
  if (filters.rto) params.set("rto", filters.rto);
  if (filters.ba) params.set("ba", filters.ba);
  if (filters.search) params.set("search", filters.search);
  if (filters.hasGeneration !== undefined) params.set("hasGeneration", filters.hasGeneration ? "true" : "false");
  if (filters.hasTransmission !== undefined) params.set("hasTransmission", filters.hasTransmission ? "true" : "false");
  if (filters.hasDistribution !== undefined) params.set("hasDistribution", filters.hasDistribution ? "true" : "false");
  if (filters.eiaIds && filters.eiaIds.length > 0) params.set("eiaIds", filters.eiaIds.join(","));
  if (filters.slugs && filters.slugs.length > 0) params.set("slugs", [...filters.slugs].sort().join(","));
  if (filters.minCustomers !== undefined) params.set("minCustomers", filters.minCustomers.toString());
  if (filters.maxCustomers !== undefined) params.set("maxCustomers", filters.maxCustomers.toString());
  if (filters.minAmiMeters !== undefined) params.set("minAmiMeters", filters.minAmiMeters.toString());
  if (filters.minTotalMeters !== undefined) params.set("minTotalMeters", filters.minTotalMeters.toString());
  if (filters.hasLogo !== undefined) params.set("hasLogo", filters.hasLogo ? "true" : "false");
  if (filters.hasWebsite !== undefined) params.set("hasWebsite", filters.hasWebsite ? "true" : "false");
  if (filters.hasTerritory !== undefined) params.set("hasTerritory", filters.hasTerritory ? "true" : "false");
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function useUtilityList(filters: UtilityListFilters = {}): UseUtilityListResult {
  const queryString = buildQueryString(filters);
  // An explicitly empty bulk filter means "no utilities wanted" — skip the
  // request instead of falling through to an unfiltered list fetch.
  const isEmptyBulkFilter =
    (filters.slugs !== undefined && filters.slugs.length === 0) ||
    (filters.eiaIds !== undefined && filters.eiaIds.length === 0);
  const url = isEmptyBulkFilter ? null : `/api/v1/utilities${queryString ? `?${queryString}` : ""}`;

  const { data, error, mutate, isLoading, isValidating } = useSWR<UtilityListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 1 hour (utility data changes occasionally)
    dedupingInterval: 3_600_000,
    keepPreviousData: true,
  });

  return {
    utilities: data?.data ?? [],
    isLoading,
    isValidating,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? null,
  };
}
