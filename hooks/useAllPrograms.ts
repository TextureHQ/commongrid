/**
 * useAllPrograms — Client hook that fetches the COMPLETE set of programs from
 * the DB-backed /api/v1/programs endpoint, following cursor pagination until
 * exhausted.
 *
 * The programs list endpoint caps `limit` at 200, but there are 600+ programs.
 * A single useProgramList({ limit: 200 }) call would silently drop everything
 * past the cap. This hook pages through all of them, which is what the old
 * synchronous getAllPrograms() (backed by the static ~500 KB programs.json)
 * did. Use ONLY where the full set is genuinely required (e.g. the explorer
 * map boundary layer); prefer useProgramList with server-side filters
 * otherwise.
 *
 * Supports a `fields` projection to keep payloads small — the map only needs
 * slug/name/status/regions.
 */

import useSWR from "swr";
import type { Program } from "@/types/programs";

const PAGE_SIZE = 200;

interface ProgramsPage {
  data: Program[];
  pagination: { cursor: string | null; hasMore: boolean };
}

interface UseAllProgramsOptions {
  /** Comma-separated sparse-fieldset projection, e.g. "slug,name,status,regions". */
  fields?: string;
  /** Set false to hold the request. */
  enabled?: boolean;
}

interface UseAllProgramsResult {
  programs: Program[];
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

async function fetchAllPrograms(fields?: string): Promise<Program[]> {
  const all: Program[] = [];
  let cursor: string | null = null;

  // Follow the cursor until the endpoint reports no more pages. Bounded by a
  // hard page cap as a safety valve against a pathological cursor loop.
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams();
    params.set("limit", PAGE_SIZE.toString());
    if (fields) params.set("fields", fields);
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/v1/programs?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch programs: ${res.statusText}`);
    }
    const json: ProgramsPage = await res.json();
    all.push(...json.data);

    cursor = json.pagination?.cursor ?? null;
    if (!cursor || !json.pagination?.hasMore) break;
  }

  return all;
}

export function useAllPrograms(options: UseAllProgramsOptions = {}): UseAllProgramsResult {
  const { fields, enabled = true } = options;
  const key = enabled ? ["all-programs", fields ?? ""] : null;

  const { data, error, mutate } = useSWR<Program[]>(key, () => fetchAllPrograms(fields), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Program data changes rarely; cache for 1 hour.
    dedupingInterval: 3_600_000,
  });

  return {
    programs: data ?? [],
    isLoading: !data && !error,
    error: error ?? null,
    mutate,
  };
}
