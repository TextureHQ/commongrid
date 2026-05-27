/**
 * useEvStationList — Client hook for fetching a filtered/sorted list of EV charging stations
 *
 * Uses SWR to fetch from /api/v1/ev-stations with query parameters.
 * Returns { evStations, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

interface EvStation {
  id: string;
  slug: string;
  name: string;
  [key: string]: unknown;
}

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
  data: EvStation[];
  pagination: EvStationListPagination;
}

interface UseEvStationListResult {
  evStations: EvStation[];
  isLoading: boolean;
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

  const { data, error, mutate } = useSWR<EvStationListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (EV station data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    evStations: data?.data ?? [],
    isLoading: !data && !error,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? null,
  };
}
