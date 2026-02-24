import Fuse, { type IFuseOptions } from "fuse.js";
import { useMemo } from "react";

/**
 * Generic Fuse.js search hook. Builds the index once, returns filtered results.
 * Falls back to all items when query is empty.
 */
export function useFuseSearch<T>(
  items: T[],
  query: string,
  options: IFuseOptions<T>
): T[] {
  const fuse = useMemo(() => new Fuse(items, options), [items, options]);

  return useMemo(() => {
    if (!query.trim()) return items;
    return fuse.search(query).map((result) => result.item);
  }, [fuse, items, query]);
}
