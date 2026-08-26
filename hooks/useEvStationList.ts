/**
 * useEvStationList — Client hook for fetching a filtered/sorted list of EV charging stations
 *
 * Uses SWR to fetch from /api/v1/ev-stations with query parameters.
 * Returns { evStations, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { EVStation } from "@/types/ev-charging";

interface EvStationListFilters {
  search?: string;
  state?: string;
  accessCode?: string;
  network?: string;
  connectorType?: string;
  level?: string;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface EvStationListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface EvStationListResponse {
  data: EVStation[];
  pagination: EvStationListPagination;
}

interface UseEvStationListResult {
  evStations: EVStation[];
  /** True only until the first successful response for the current key set. */
  isLoading: boolean;
  /**
   * True whenever a request is in flight, including background refetches that
   * are showing previous EV stations via `keepPreviousData`. Drive row-level
   * loading affordances off this — never a full-surface swap that would
   * unmount the search input.
   */
  isFetching: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: EvStationListPagination | null;
}

const fetcher = async (url: string): Promise<EvStationListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch EV stations: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: EvStationListFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.state) params.set("state", filters.state);
  if (filters.accessCode) params.set("accessCode", filters.accessCode);
  if (filters.network) params.set("network", filters.network);
  if (filters.connectorType) params.set("connectorType", filters.connectorType);
  if (filters.level) params.set("level", filters.level);
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function useEvStationList(filters: EvStationListFilters = {}): UseEvStationListResult {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/ev-stations${queryString ? `?${queryString}` : ""}`;

  const {
    data,
    error,
    mutate,
    isLoading: swrIsLoading,
    isValidating,
  } = useSWR<EvStationListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Keep the last page of results rendered while a new query (e.g. a
    // changed search term) is in flight. Without this the SWR key change
    // makes `data` undefined, callers see an empty list, and every list
    // surface swapped itself for a full-page loader mid-keystroke.
    keepPreviousData: true,
    // Cache for 24 hours (EV station data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    evStations: data?.data ?? [],
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
