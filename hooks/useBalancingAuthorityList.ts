/**
 * useBalancingAuthorityList — Client hook for fetching a filtered list of balancing authorities
 *
 * Uses SWR to fetch from /api/v1/balancing-authorities with query parameters.
 * Returns { balancingAuthorities, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { BalancingAuthority } from "@/types/entities";

interface BalancingAuthorityListFilters {
  isoId?: string;
  state?: string;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface BalancingAuthorityListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface BalancingAuthorityListResponse {
  data: BalancingAuthority[];
  pagination: BalancingAuthorityListPagination;
}

interface UseBalancingAuthorityListResult {
  balancingAuthorities: BalancingAuthority[];
  isLoading: boolean;
  isValidating: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: BalancingAuthorityListPagination | null;
}

const fetcher = async (url: string): Promise<BalancingAuthorityListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch balancing authorities: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: BalancingAuthorityListFilters): string {
  const params = new URLSearchParams();

  if (filters.isoId) params.set("isoId", filters.isoId);
  if (filters.state) params.set("state", filters.state);
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function useBalancingAuthorityList(
  filters: BalancingAuthorityListFilters = {}
): UseBalancingAuthorityListResult {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/balancing-authorities${queryString ? `?${queryString}` : ""}`;

  const { data, error, mutate, isLoading, isValidating } = useSWR<BalancingAuthorityListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (BA data doesn't change often)
    dedupingInterval: 86_400_000,
    keepPreviousData: true,
  });

  return {
    balancingAuthorities: data?.data ?? [],
    isLoading,
    isValidating,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? null,
  };
}
