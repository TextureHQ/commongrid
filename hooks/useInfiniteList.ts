/**
 * useInfiniteList — Generic cursor-paginated list hook with intersection-based
 * auto-loading for the right-edge explore panels.
 *
 * Why this exists:
 * Several panels (EV charging, power plants, transmission lines, pricing
 * nodes) used to fetch up to 500 rows in one shot and run client-side Fuse
 * search over the bag. That pattern silently broke on datasets the API
 * caps at 200 (EV stations: 85k rows — `limit=500` returns 400 and the
 * panel renders "0 results"), and it doesn't scale for large datasets.
 *
 * This hook standardizes on:
 *   - server-side `search` (every list API supports `search`, min 2 chars)
 *   - cursor pagination at the API's safe page size (default 50)
 *   - IntersectionObserver auto-load — the panel passes back a `sentinelRef`
 *     to attach to a bottom-of-list element; when it scrolls into view, the
 *     next page is fetched.
 *
 * The hook is endpoint-agnostic. Callers supply:
 *   - `endpoint` — REST URL ("/api/v1/ev-stations")
 *   - `params` — filter/sort key-value pairs (q, type, voltage, etc.)
 *   - optional `pageSize` (default 50)
 *
 * Reset rule: any change to the serialized shape of `params` resets the list
 * and re-fetches page 1. Request serialization (via an incrementing ref)
 * discards stale responses when filters change quickly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface InfiniteListResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface UseInfiniteListResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  /** Attach to the sentinel element at the bottom of the visible list. */
  sentinelRef: (node: HTMLElement | null) => void;
  /** Manually trigger the next page (e.g. fallback button when IO is unavailable). */
  loadMore: () => void;
  /** Force a full reload of page 1 with current params. */
  reload: () => void;
}

export interface UseInfiniteListOptions {
  /** REST endpoint without query string, e.g. "/api/v1/ev-stations". */
  endpoint: string;
  /**
   * Query params — sent as-is in the query string. `undefined`, empty strings,
   * and empty arrays are skipped. Strings under 2 chars on the `search` key
   * are also skipped (every API enforces min 2 chars).
   */
  params?: Record<string, string | number | undefined>;
  /** Page size. Defaults to 50; APIs cap at 200. */
  pageSize?: number;
  /** Debounce window for `search` param in ms. Defaults to 300. */
  searchDebounceMs?: number;
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_DEBOUNCE_MS = 300;
const MAX_PAGE_SIZE = 200;

function buildQueryString(
  params: Record<string, string | number | undefined>,
  pageSize: number,
  cursor: string | null
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (str === "") continue;
    // Every list API rejects search < 2 chars with a 400; skip rather than 400.
    if (key === "search" && str.length < 2) continue;
    qs.set(key, str);
  }
  qs.set("limit", String(Math.min(pageSize, MAX_PAGE_SIZE)));
  if (cursor) qs.set("cursor", cursor);
  return qs.toString();
}

export function useInfiniteList<T>(options: UseInfiniteListOptions): UseInfiniteListResult<T> {
  const { endpoint, params = {}, pageSize = DEFAULT_PAGE_SIZE, searchDebounceMs = DEFAULT_DEBOUNCE_MS } = options;

  // ---------------------------------------------------------------------------
  // Debounce the `search` param so we don't fire a request per keystroke.
  // Other params (sort, filters) are not debounced because they're
  // discrete-change controls — selects, dropdowns.
  // ---------------------------------------------------------------------------
  const rawSearch = typeof params.search === "string" ? params.search : "";
  const [debouncedSearch, setDebouncedSearch] = useState(rawSearch);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(rawSearch), searchDebounceMs);
    return () => clearTimeout(handle);
  }, [rawSearch, searchDebounceMs]);

  // Serialize the non-search params to a stable string so the fetch effect
  // can depend on params-by-value without thrashing on object identity.
  // Search is layered on separately via the debounced value.
  const otherParamsKey = useMemo(() => {
    const entries = Object.entries(params)
      .filter(([k]) => k !== "search")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, v === undefined ? null : v]);
    return JSON.stringify(entries);
  }, [params]);

  // The effective param set for any current request. Recomputed from the
  // stable keys above so it doesn't change identity when the parent re-renders
  // with the same logical params.
  const effectiveParams = useMemo<Record<string, string | number | undefined>>(() => {
    const parsed: Array<[string, string | number | null]> = JSON.parse(otherParamsKey);
    const out: Record<string, string | number | undefined> = {};
    for (const [k, v] of parsed) {
      out[k] = v === null ? undefined : v;
    }
    out.search = debouncedSearch;
    return out;
  }, [otherParamsKey, debouncedSearch]);

  // ---------------------------------------------------------------------------
  // Fetch state
  // ---------------------------------------------------------------------------
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Reload trigger that consumers can bump via `reload()`. */
  const [reloadKey, setReloadKey] = useState(0);

  // Request serialization: stale responses are discarded when params change.
  const requestIdRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Initial fetch + reset on params change
  // ---------------------------------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the explicit refetch trigger from reload()
  useEffect(() => {
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const qs = buildQueryString(effectiveParams, pageSize, null);
    const controller = new AbortController();

    fetch(`${endpoint}?${qs}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as InfiniteListResponse<T>;
      })
      .then((result) => {
        if (currentRequestId !== requestIdRef.current) return;
        setItems(result.data);
        setCursor(result.pagination.cursor);
        setTotal(result.pagination.total);
        setHasMore(result.pagination.hasMore);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (currentRequestId !== requestIdRef.current) return;
        console.error(`useInfiniteList: failed to load ${endpoint}`, err);
        setError(err instanceof Error ? err.message : "Failed to load");
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [endpoint, effectiveParams, pageSize, reloadKey]);

  // ---------------------------------------------------------------------------
  // loadMore — append next page
  // ---------------------------------------------------------------------------
  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore || !hasMore) return;
    const currentRequestId = requestIdRef.current;
    setIsLoadingMore(true);

    try {
      const qs = buildQueryString(effectiveParams, pageSize, cursor);
      const res = await fetch(`${endpoint}?${qs}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const result = (await res.json()) as InfiniteListResponse<T>;
      if (currentRequestId !== requestIdRef.current) return;
      setItems((prev) => [...prev, ...result.data]);
      setCursor(result.pagination.cursor);
      setHasMore(result.pagination.hasMore);
    } catch (err) {
      console.error(`useInfiniteList: failed to load more from ${endpoint}`, err);
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore, hasMore, effectiveParams, pageSize, endpoint]);

  // ---------------------------------------------------------------------------
  // IntersectionObserver sentinel — auto-load when the bottom marker enters
  // the viewport.
  // ---------------------------------------------------------------------------
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return; // SSR / very old browsers

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadMoreRef.current();
          }
        }
      },
      // Trigger 200px before the sentinel actually enters the viewport so the
      // user rarely sees a hard pause at the bottom.
      { rootMargin: "200px" }
    );
    observerRef.current.observe(node);
  }, []);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
    },
    []
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    items,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    sentinelRef,
    loadMore,
    reload,
  };
}
