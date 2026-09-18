"use client";

import { TextField } from "@texturehq/edges";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  resultCount?: number;
  resultLabel?: string;
}

/**
 * Search box used above the listing pages.
 *
 * The magnifying glass and the clear button used to be hand-placed elements
 * absolutely positioned over a bare `<input>`, which meant this component also
 * hand-rolled its own focus ring — a second ring on top of the one the design
 * system draws. `TextField` provides both affordances (`showSearchIcon`,
 * `isClearable`) and owns the focus treatment, so all of that goes away.
 */
export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = "Search...",
  resultCount,
  resultLabel,
}: SearchInputProps) {
  const showCount = resultCount !== undefined && value !== "";

  return (
    <div className="relative">
      <TextField
        aria-label={placeholder}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        showSearchIcon
        isClearable
        onClear={onClear}
        // The field reserves room for an error message it never shows here;
        // reclaiming it keeps the control the same height as before.
        reserveErrorSpace={false}
      />
      {showCount && (
        // Sits left of the clear button so the two never overlap.
        <span className="pointer-events-none absolute inset-y-0 right-10 flex items-center text-xs text-text-muted tabular-nums whitespace-nowrap">
          {resultCount.toLocaleString()} {resultLabel ?? "results"}
        </span>
      )}
    </div>
  );
}
