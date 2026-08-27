"use client";

/**
 * UtilityAutocomplete — searchable utility picker backed by the public API.
 *
 * Why this exists: CommonGrid tracks 3,000+ utilities, far too many to put in a
 * native `<select>`. The previous approach fetched a single truncated page, which
 * silently hid most of the registry — any utility sorting after the cutoff was
 * unreachable, with nothing to indicate the list was incomplete.
 *
 * The Edges `Autocomplete` debounces the typed text and queries
 * `/api/v1/utilities?search=` so the server does the matching, putting only the
 * handful of relevant rows in the DOM. Query building and response parsing live
 * in `@/lib/utility-search` so they can be unit tested.
 */

import { Autocomplete } from "@texturehq/edges";
import { useCallback, useMemo, useState } from "react";
import {
  mergeUtilityOptions,
  parseUtilityOptions,
  shouldSearchUtilities,
  UTILITY_SEARCH_URL_TEMPLATE,
  type UtilityOption,
} from "@/lib/utility-search";

interface UtilityAutocompleteProps {
  /** Selected utility slug, or "" when nothing is selected. */
  value: string;
  /** Called with the new slug, or "" when the selection is cleared. */
  onChange: (slug: string) => void;
  label?: string;
  description?: string;
  placeholder?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  errorMessage?: string;
  /**
   * Options to make selectable without a search first, used when `value` is set
   * before the user types anything.
   *
   * `Autocomplete` resolves `selectedKey` to a display label by looking through
   * its items, so a preselected slug with no matching option renders an empty
   * input — the selection is live but invisible. Seeding the utility's
   * `{ id: slug, name }` pair keeps the field readable from first paint.
   */
  seedOptions?: UtilityOption[];
}

export function UtilityAutocomplete({
  value,
  onChange,
  label = "Utility",
  description,
  placeholder = "Start typing a utility name…",
  isRequired,
  isDisabled,
  errorMessage,
  seedOptions,
}: UtilityAutocompleteProps) {
  /**
   * Options resolved so far, retained so the input can display the *name* of the
   * current selection. `Autocomplete` maps `selectedKey` to a label by looking
   * through `staticItems` rather than the async results, so without this cache
   * the field would blank out once a later search replaced those results.
   */
  const [resolvedOptions, setResolvedOptions] = useState<UtilityOption[]>([]);

  const transformResponse = useCallback((data: unknown): UtilityOption[] => {
    const options = parseUtilityOptions(data);
    setResolvedOptions((previous) => mergeUtilityOptions(previous, options));
    return options;
  }, []);

  /**
   * Seeded options are merged rather than stored so an async seed (a utility
   * fetched after mount) still shows up, and so searching never drops the
   * label of a preselected utility.
   */
  const items = useMemo(
    () => (seedOptions?.length ? mergeUtilityOptions(resolvedOptions, seedOptions) : resolvedOptions),
    [resolvedOptions, seedOptions]
  );

  return (
    <Autocomplete
      label={label}
      description={description}
      placeholder={placeholder}
      isRequired={isRequired}
      isDisabled={isDisabled}
      errorMessage={errorMessage}
      selectedKey={value === "" ? null : value}
      onSelectionChange={(key) => onChange(key == null ? "" : String(key))}
      staticItems={items}
      requestConfig={{
        requestType: "REST",
        url: UTILITY_SEARCH_URL_TEMPLATE,
        shouldLoad: shouldSearchUtilities,
        transformResponse,
      }}
    />
  );
}
