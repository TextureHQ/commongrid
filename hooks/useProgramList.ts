/**
 * useProgramList — Client hook for fetching a filtered/sorted list of programs
 *
 * Uses SWR to fetch from /api/v1/programs with query parameters.
 * Returns { programs, isLoading, error, mutate, pagination }
 */

import useSWR from "swr";

import type { Program } from "@/types/programs";

interface ProgramListFilters {
  status?: string;
  assetType?: string;
  marketSegment?: string;
  gridService?: string;
  /**
   * Entity slug of an associated organization (e.g. a utility slug). Filters
   * server-side against `organizations[].entityId`.
   *
   * Prefer this over fetching a page of programs and filtering client-side:
   * the endpoint caps `limit` at 200 of 600+ programs, so client-side
   * filtering silently drops any match past the cap.
   */
  organization?: string;
  /** Narrow `organization` to a single role. Requires `organization`. */
  organizationRole?: "ADMINISTRATOR" | "IMPLEMENTER" | "FUNDER" | "REGULATOR";
  search?: string;
  fields?: string;
  sort?: "name" | "status";
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
  /**
   * Set false to hold the request (SWR key becomes null). Use while a required
   * filter value is still resolving, so we never fire an unfiltered fetch that
   * would return the wrong set.
   */
  enabled?: boolean;
}

interface ProgramListPagination {
  totalCount: number;
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface ProgramListResponse {
  data: Program[];
  pagination: ProgramListPagination;
}

interface UseProgramListResult {
  programs: Program[];
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
  pagination: ProgramListPagination | null;
}

const fetcher = async (url: string): Promise<ProgramListResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch programs: ${res.statusText}`);
  }
  return res.json();
};

function buildQueryString(filters: ProgramListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) params.set("status", filters.status);
  if (filters.assetType) params.set("assetType", filters.assetType);
  if (filters.marketSegment) params.set("marketSegment", filters.marketSegment);
  if (filters.gridService) params.set("gridService", filters.gridService);
  if (filters.organization) params.set("organization", filters.organization);
  if (filters.organization && filters.organizationRole) params.set("organizationRole", filters.organizationRole);
  if (filters.search) params.set("search", filters.search);
  if (filters.fields) params.set("fields", filters.fields);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.cursor) params.set("cursor", filters.cursor);

  return params.toString();
}

export function useProgramList(filters: ProgramListFilters = {}): UseProgramListResult {
  const { enabled = true, ...queryFilters } = filters;
  const queryString = buildQueryString(queryFilters);
  const url = `/api/v1/programs${queryString ? `?${queryString}` : ""}`;

  const { data, error, mutate } = useSWR<ProgramListResponse>(enabled ? url : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 24 hours (programs don't change often)
    dedupingInterval: 86_400_000,
  });

  return {
    programs: data?.data ?? [],
    // While disabled we report loading rather than "loaded and empty", so
    // callers don't render a false "no programs" state before the filter value
    // they're waiting on arrives.
    isLoading: !data && !error,
    error: error ?? null,
    mutate,
    pagination: data?.pagination ?? null,
  };
}
