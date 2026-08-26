/**
 * usePowerPlantList — Client hook for fetching a filtered/sorted list of power plants
 *
 * Uses SWR to fetch from /api/v1/power-plants with query parameters.
 * Returns { powerPlants, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { PowerPlant } from "@/types/entities";

interface PowerPlantListFilters {
  search?: string;
  state?: string;
  utilityId?: string;
  baId?: string;
  fuelCategory?: string;
  status?: string;
  minCapacityMw?: number;
  maxCapacityMw?: number;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface PowerPlantListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface PowerPlantListResponse {
  data: PowerPlant[];
  pagination: PowerPlantListPagination;
}

interface UsePowerPlantListResult {
  powerPlants: PowerPlant[];
  /** True only until the first successful response for the current key set. */
  isLoading: boolean;
  /**
   * True whenever a request is in flight, including background refetches that
   * are showing previous power plants via `keepPreviousData`. Drive row-level
   * loading affordances off this — never a full-surface swap that would
   * unmount the search input.
   */
  isFetching: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: PowerPlantListPagination | null;
}

const fetcher = async (url: string): Promise<PowerPlantListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch power plants: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: PowerPlantListFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.state) params.set("state", filters.state);
  if (filters.utilityId) params.set("utilityId", filters.utilityId);
  if (filters.baId) params.set("baId", filters.baId);
  if (filters.fuelCategory) params.set("fuelCategory", filters.fuelCategory);
  if (filters.status) params.set("status", filters.status);
  if (filters.minCapacityMw !== undefined) params.set("minCapacityMw", filters.minCapacityMw.toString());
  if (filters.maxCapacityMw !== undefined) params.set("maxCapacityMw", filters.maxCapacityMw.toString());
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function usePowerPlantList(filters: PowerPlantListFilters = {}): UsePowerPlantListResult {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/power-plants${queryString ? `?${queryString}` : ""}`;

  const {
    data,
    error,
    mutate,
    isLoading: swrIsLoading,
    isValidating,
  } = useSWR<PowerPlantListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Keep the last page of results rendered while a new query (e.g. a
    // changed search term) is in flight. Without this the SWR key change
    // makes `data` undefined, callers see an empty list, and every list
    // surface swapped itself for a full-page loader mid-keystroke.
    keepPreviousData: true,
    // Cache for 24 hours (power plant data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    powerPlants: data?.data ?? [],
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
