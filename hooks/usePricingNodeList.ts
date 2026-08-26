/**
 * usePricingNodeList — Client hook for fetching a filtered/sorted list of pricing nodes
 *
 * Uses SWR to fetch from /api/v1/pricing-nodes with query parameters.
 * Returns { pricingNodes, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { PricingNode } from "@/types/pricing-nodes";

interface PricingNodeListFilters {
  search?: string;
  iso?: string;
  state?: string;
  nodeType?: string;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface PricingNodeListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface PricingNodeListResponse {
  data: PricingNode[];
  pagination: PricingNodeListPagination;
}

interface UsePricingNodeListResult {
  pricingNodes: PricingNode[];
  /** True only until the first successful response for the current key set. */
  isLoading: boolean;
  /**
   * True whenever a request is in flight, including background refetches that
   * are showing previous pricing nodes via `keepPreviousData`. Drive row-level
   * loading affordances off this — never a full-surface swap that would
   * unmount the search input.
   */
  isFetching: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: PricingNodeListPagination | null;
}

const fetcher = async (url: string): Promise<PricingNodeListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch pricing nodes: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: PricingNodeListFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.iso) params.set("iso", filters.iso);
  if (filters.state) params.set("state", filters.state);
  if (filters.nodeType) params.set("nodeType", filters.nodeType);
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function usePricingNodeList(filters: PricingNodeListFilters = {}): UsePricingNodeListResult {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/pricing-nodes${queryString ? `?${queryString}` : ""}`;

  const {
    data,
    error,
    mutate,
    isLoading: swrIsLoading,
    isValidating,
  } = useSWR<PricingNodeListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Keep the last page of results rendered while a new query (e.g. a
    // changed search term) is in flight. Without this the SWR key change
    // makes `data` undefined, callers see an empty list, and every list
    // surface swapped itself for a full-page loader mid-keystroke.
    keepPreviousData: true,
    // Cache for 24 hours (pricing node metadata doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    pricingNodes: data?.data ?? [],
    // `swrIsLoading` is false once ANY data is available for this hook,
    // including previous-key data retained by `keepPreviousData`. That is
    // exactly the semantics we want: a search-term change must not read as
    // a first load.
    isLoading: swrIsLoading,
    isFetching: isValidating,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? null,
  };
}
