/**
 * Helpers for the server-backed utility picker.
 *
 * These live outside the React component so the query construction and response
 * parsing can be tested directly — they're the parts where a silent mistake
 * turns into "the utility I need isn't in the list."
 */

/** Option shape consumed by the Edges `Autocomplete` component. */
export interface UtilityOption {
  id: string;
  name: string;
}

/**
 * Matches requested per keystroke. The popover scrolls, so this is about
 * response size, not about limiting what a user can reach: a more specific
 * query beats a longer list.
 */
export const UTILITY_SEARCH_LIMIT = 25;

/**
 * Single characters match thousands of utilities and none of those results help,
 * so requests are held until the query carries some signal.
 */
export const MIN_UTILITY_QUERY_LENGTH = 2;

/**
 * URL template for Edges `Autocomplete`, which substitutes `{q}` with the typed
 * text.
 *
 * `fields=slug,name` trims the payload to what the dropdown renders; the list
 * endpoint otherwise returns complete utility records.
 *
 * `search={q}` is deliberately LAST. Edges interpolates `{q}` without
 * URL-encoding it, so a typed `&` — common in utility names such as
 * "Bozrah Light & Power" — starts a new query-string parameter. Keeping `search`
 * last means that overflow becomes trailing params the API ignores, and `search`
 * still receives a prefix of the typed text, which substring-matches the
 * intended utility. Ordering this parameter anywhere else would instead let the
 * overflow swallow `limit` and `fields`.
 */
export const UTILITY_SEARCH_URL_TEMPLATE = `/api/v1/utilities?limit=${UTILITY_SEARCH_LIMIT}&fields=slug,name&search={q}`;

/** Whether a query is specific enough to be worth a request. */
export function shouldSearchUtilities(filterText: string): boolean {
  return filterText.trim().length >= MIN_UTILITY_QUERY_LENGTH;
}

/**
 * Convert a `/api/v1/utilities` list response into picker options.
 *
 * Defensive by design: this parses data crossing a network boundary, and an
 * unexpected shape should degrade to "no matches" rather than throw inside the
 * component's async list loader. Records missing a `slug` or `name` are dropped
 * because an option needs both a stable value and a readable label.
 */
export function parseUtilityOptions(data: unknown): UtilityOption[] {
  if (typeof data !== "object" || data === null) return [];

  const rows = (data as { data?: unknown }).data;
  if (!Array.isArray(rows)) return [];

  const options: UtilityOption[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const { slug, name } = row as { slug?: unknown; name?: unknown };
    if (typeof slug === "string" && slug !== "" && typeof name === "string" && name !== "") {
      options.push({ id: slug, name });
    }
  }
  return options;
}

/**
 * Merge newly fetched options into the set already resolved.
 *
 * The picker needs this because Edges `Autocomplete` resolves `selectedKey` to a
 * display label by searching `staticItems`, not the async results. Without an
 * accumulating cache, the input would blank out as soon as a later search
 * replaced the results containing the current selection.
 *
 * Returns the original array reference when nothing was added, keeping identity
 * stable for React dependency comparisons.
 */
export function mergeUtilityOptions(existing: UtilityOption[], incoming: UtilityOption[]): UtilityOption[] {
  const byId = new Map(existing.map((option) => [option.id, option]));
  let added = false;
  for (const option of incoming) {
    if (!byId.has(option.id)) {
      byId.set(option.id, option);
      added = true;
    }
  }
  return added ? Array.from(byId.values()) : existing;
}
