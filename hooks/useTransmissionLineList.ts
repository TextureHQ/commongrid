/**
 * useTransmissionLineList — Client hook for fetching a filtered/sorted list of transmission lines
 *
 * Uses SWR to fetch from /api/v1/transmission-lines with query parameters.
 * Returns { transmissionLines, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { TransmissionLine } from "@/types/transmission-lines";

interface TransmissionLineListFilters {
  search?: string;
  owner?: string;
  voltageClass?: string;
  status?: string;
  fields?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface TransmissionLineListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface TransmissionLineListResponse {
  data: TransmissionLine[];
  pagination: TransmissionLineListPagination;
}

interface UseTransmissionLineListResult {
  transmissionLines: TransmissionLine[];
  /** True only until the first successful response for the current key set. */
  isLoading: boolean;
  /**
   * True whenever a request is in flight, including background refetches that
   * are showing previous transmission lines via `keepPreviousData`. Drive row-level
   * loading affordances off this — never a full-surface swap that would
   * unmount the search input.
   */
  isFetching: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: TransmissionLineListPagination | null;
}

const fetcher = async (url: string): Promise<TransmissionLineListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch transmission lines: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: TransmissionLineListFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.voltageClass) params.set("voltageClass", filters.voltageClass);
  if (filters.status) params.set("status", filters.status);
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function useTransmissionLineList(filters: TransmissionLineListFilters = {}): UseTransmissionLineListResult {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/transmission-lines${queryString ? `?${queryString}` : ""}`;

  const {
    data,
    error,
    mutate,
    isLoading: swrIsLoading,
    isValidating,
  } = useSWR<TransmissionLineListResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Keep the last page of results rendered while a new query (e.g. a
    // changed search term) is in flight. Without this the SWR key change
    // makes `data` undefined, callers see an empty list, and every list
    // surface swapped itself for a full-page loader mid-keystroke.
    keepPreviousData: true,
    // Cache for 24 hours (transmission line data doesn't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    transmissionLines: data?.data ?? [],
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
