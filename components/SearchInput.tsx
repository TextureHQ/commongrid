"use client";

import { Icon } from "@texturehq/edges";
import { useRef } from "react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  resultCount?: number;
  resultLabel?: string;
}

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = "Search...",
  resultCount,
  resultLabel,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
        <Icon name="MagnifyingGlass" size={18} />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 pl-10 pr-20 rounded-lg border border-border-default bg-background-surface text-text-body text-base placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/40 focus:border-brand-primary transition-colors"
      />
      <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3">
        {value && (
          <button
            type="button"
            onClick={() => {
              onClear();
              inputRef.current?.focus();
            }}
            className="text-text-muted hover:text-text-body transition-colors p-0.5"
            aria-label="Clear search"
          >
            <Icon name="X" size={16} />
          </button>
        )}
        {resultCount !== undefined && value && (
          <span className="text-xs text-text-muted tabular-nums whitespace-nowrap">
            {resultCount.toLocaleString()} {resultLabel ?? "results"}
          </span>
        )}
      </div>
    </div>
  );
}
