"use client";

import { Icon, TextField } from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useEvStationList } from "@/hooks/useEvStationList";
import { usePowerPlantList } from "@/hooks/usePowerPlantList";
import { usePricingNodeList } from "@/hooks/usePricingNodeList";
import { useProgramList } from "@/hooks/useProgramList";
import { useUtilityList } from "@/hooks/useUtilityList";
import { getAllBalancingAuthorities, getAllIsos, getAllRtos } from "@/lib/data";
import { BROWSE_ENTRIES, ENTITY_BY_KIND, type EntityKind } from "@/lib/entity-catalog";
import type { BalancingAuthority, Iso, PowerPlant, Rto, Utility } from "@/types/entities";
import type { EVStation } from "@/types/ev-charging";
import type { PricingNode } from "@/types/pricing-nodes";
import type { Program } from "@/types/programs";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface GlobalSearchContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
});

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return <GlobalSearchContext.Provider value={{ isOpen, open, close }}>{children}</GlobalSearchContext.Provider>;
}

export function useGlobalSearch(): GlobalSearchContextValue {
  return useContext(GlobalSearchContext);
}

// ---------------------------------------------------------------------------
// Search result types
// ---------------------------------------------------------------------------

interface SearchResult {
  kind: EntityKind;
  slug: string;
  name: string;
  subtitle: string;
  href: string;
  dotColor: string;
}

// Order in which kinds appear in the search-result list
const KIND_ORDER: EntityKind[] = [
  "utility",
  "iso",
  "rto",
  "ba",
  "power-plant",
  "ev-station",
  "pricing-node",
  "program",
];

const KIND_DOT_COLOR_FALLBACK = "bg-slate-400";
const KIND_TILE_BG_FALLBACK = "bg-slate-100";
const KIND_DOT_COLOR = Object.fromEntries(
  KIND_ORDER.map((k) => [k, ENTITY_BY_KIND[k]?.dotColor ?? KIND_DOT_COLOR_FALLBACK])
) as Record<EntityKind, string>;

const KIND_LABELS = Object.fromEntries(KIND_ORDER.map((k) => [k, ENTITY_BY_KIND[k]?.label ?? k])) as Record<
  EntityKind,
  string
>;

const MAX_PER_KIND = 5;

// ---------------------------------------------------------------------------
// Helpers to convert to SearchResult
// ---------------------------------------------------------------------------

function utilityToResult(u: Utility): SearchResult {
  return {
    kind: "utility",
    slug: u.slug,
    name: u.name,
    subtitle: [u.jurisdiction, u.segment].filter(Boolean).join(" · "),
    href: `/explore?view=utilities&slug=${u.slug}`,
    dotColor: KIND_DOT_COLOR.utility,
  };
}

function isoToResult(iso: Iso): SearchResult {
  return {
    kind: "iso",
    slug: iso.slug,
    name: iso.name,
    subtitle: `ISO · ${iso.shortName}`,
    href: `/explore?view=grid-operators&slug=${iso.slug}`,
    dotColor: KIND_DOT_COLOR.iso,
  };
}

function rtoToResult(rto: Rto): SearchResult {
  return {
    kind: "rto",
    slug: rto.slug,
    name: rto.name,
    subtitle: `RTO · ${rto.shortName}`,
    href: `/explore?view=grid-operators&slug=${rto.slug}`,
    dotColor: KIND_DOT_COLOR.rto,
  };
}

function baToResult(ba: BalancingAuthority): SearchResult {
  return {
    kind: "ba",
    slug: ba.slug,
    name: ba.name,
    subtitle: `Balancing Authority · ${ba.shortName}`,
    href: `/explore?view=grid-operators&slug=${ba.slug}`,
    dotColor: KIND_DOT_COLOR.ba,
  };
}

function pricingNodeToResult(node: PricingNode): SearchResult {
  return {
    kind: "pricing-node",
    slug: node.slug,
    name: node.name,
    subtitle: [node.iso, node.state].filter(Boolean).join(" · "),
    href: `/explore?view=pricing-nodes&slug=${node.slug}`,
    dotColor: KIND_DOT_COLOR["pricing-node"],
  };
}

function programToResult(program: Program): SearchResult {
  const orgName = program.organizationNames?.[0];
  const subtitle = orgName ? `${orgName} · Program · ${program.status}` : `Program · ${program.status}`;

  return {
    kind: "program",
    slug: program.slug,
    name: program.name,
    subtitle,
    href: `/explore?view=programs&slug=${program.slug}`,
    dotColor: KIND_DOT_COLOR.program,
  };
}

function plantToResult(plant: PowerPlant): SearchResult {
  return {
    kind: "power-plant",
    slug: plant.slug,
    name: plant.name,
    subtitle: [plant.fuelCategory, plant.state].filter(Boolean).join(" · "),
    href: `/explore?view=power-plants&slug=${plant.slug}`,
    dotColor: KIND_DOT_COLOR["power-plant"],
  };
}

function stationToResult(station: EVStation): SearchResult {
  return {
    kind: "ev-station",
    slug: station.slug,
    name: station.stationName,
    subtitle: [station.evNetwork, station.city, station.state].filter(Boolean).join(" · "),
    href: `/explore?view=ev-charging&slug=${station.slug}`,
    dotColor: KIND_DOT_COLOR["ev-station"],
  };
}

// ---------------------------------------------------------------------------
// Static search for small datasets (ISOs/RTOs)
// ---------------------------------------------------------------------------

function searchStatic<T extends { name: string; shortName?: string }>(items: T[], query: string): T[] {
  const q = query.toLowerCase();
  return items.filter((item) => {
    const name = item.name.toLowerCase();
    const shortName = item.shortName?.toLowerCase() ?? "";
    return name.includes(q) || shortName.includes(q);
  });
}

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

export function GlobalSearchModal() {
  const { isOpen, close } = useGlobalSearch();
  const posthog = usePostHog();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const focusInput = useCallback(() => {
    const el = searchWrapperRef.current?.querySelector("input");
    el?.focus();
  }, []);
  const [activeIndex, setActiveIndex] = useState(0);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Static data (small datasets - ISOs, RTOs, BAs)
  const isos = useMemo(() => getAllIsos(), []);
  const rtos = useMemo(() => getAllRtos(), []);
  const bas = useMemo(() => getAllBalancingAuthorities(), []);

  // API-based search for large datasets
  const shouldSearch = debouncedQuery.trim().length >= 2;
  const searchTerm = shouldSearch ? debouncedQuery.trim() : undefined;

  const { utilities } = useUtilityList({ search: searchTerm, limit: MAX_PER_KIND });
  const { powerPlants } = usePowerPlantList({ search: searchTerm, limit: MAX_PER_KIND });
  const { evStations } = useEvStationList({ search: searchTerm, limit: MAX_PER_KIND });
  const { pricingNodes } = usePricingNodeList({ search: searchTerm, limit: MAX_PER_KIND });
  const { programs } = useProgramList({ search: searchTerm, limit: MAX_PER_KIND });

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setDebouncedQuery("");
      setActiveIndex(0);
      setTimeout(() => focusInput(), 50);
    }
  }, [isOpen, focusInput]);

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  // Build results from API responses + static search
  const results = useMemo<SearchResult[]>(() => {
    if (!shouldSearch) return [];

    const out: SearchResult[] = [];

    // Utilities (API)
    out.push(...utilities.slice(0, MAX_PER_KIND).map(utilityToResult));

    // ISOs (static - small dataset)
    const isoResults = searchStatic(isos, debouncedQuery);
    out.push(...isoResults.slice(0, MAX_PER_KIND).map(isoToResult));

    // RTOs (static - small dataset)
    const rtoResults = searchStatic(rtos, debouncedQuery);
    out.push(...rtoResults.slice(0, MAX_PER_KIND).map(rtoToResult));

    // Balancing Authorities (static - small dataset)
    const baResults = searchStatic(bas, debouncedQuery);
    out.push(...baResults.slice(0, MAX_PER_KIND).map(baToResult));

    // Power Plants (API)
    out.push(...powerPlants.slice(0, MAX_PER_KIND).map(plantToResult));

    // EV Stations (API)
    out.push(...evStations.slice(0, MAX_PER_KIND).map(stationToResult));

    // Pricing Nodes (API)
    out.push(...pricingNodes.slice(0, MAX_PER_KIND).map(pricingNodeToResult));

    // Programs (API)
    out.push(...programs.slice(0, MAX_PER_KIND).map(programToResult));

    return out;
  }, [shouldSearch, debouncedQuery, utilities, isos, rtos, bas, powerPlants, evStations, pricingNodes, programs]);

  // Group results by kind (maintain KIND_ORDER order)
  const grouped = useMemo<Array<{ kind: EntityKind; label: string; items: SearchResult[] }>>(() => {
    const map = new Map<EntityKind, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.kind)) map.set(r.kind, []);
      map.get(r.kind)?.push(r);
    }
    return KIND_ORDER.filter((k) => map.has(k)).map((k) => ({
      kind: k,
      label: KIND_LABELS[k],
      // biome-ignore lint/style/noNonNullAssertion: map.has(k) was checked in the filter above
      items: map.get(k)!,
    }));
  }, [results]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, []);

  const navigateTo = useCallback(
    (result: SearchResult) => {
      // Capture the selected record type, never a free-text query or entity name.
      posthog.capture("registry_search_result_selected", { entity_type: result.kind });
      router.push(result.href);
      close();
    },
    [router, close, posthog]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const result = results[activeIndex];
        if (result) navigateTo(result);
      }
    },
    [results, activeIndex, navigateTo]
  );

  if (!isOpen) return null;

  // Flatten results for keyboard nav indexing
  let flatIndex = 0;

  const QUICK_LINKS = BROWSE_ENTRIES.map((entry) => ({
    label: entry.label,
    href: entry.href,
    kind: entry.kind,
    subtitle: `${entry.count.toLocaleString("en-US")} ${entry.noun}`,
    dotColor: entry.dotColor,
    tileBg: entry.tileBg,
  }));

  const isLoading = query.trim().length >= 2 && debouncedQuery !== query;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70]"
        style={{
          background: "var(--color-background-modal)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
        onClick={close}
        aria-hidden="true"
      />

      {/* Modal positioning styles */}
      <style>{`
        .og-search-modal-wrapper {
          top: 0;
          left: 0;
          right: 0;
        }
        .og-search-panel {
          height: 100dvh;
          border-radius: 0;
        }
        .og-search-textfield-wrapper > * {
          width: 100%;
        }
        .og-search-textfield-wrapper input::-webkit-search-decoration,
        .og-search-textfield-wrapper input::-webkit-search-cancel-button,
        .og-search-textfield-wrapper input::-webkit-search-results-button,
        .og-search-textfield-wrapper input::-webkit-search-results-decoration {
          -webkit-appearance: none;
        }
        .og-search-row {
          padding-left: 12px;
          padding-right: 12px;
          gap: 8px;
        }
        .og-search-section-label {
          font-size: 11px;
          font-weight: 600;
          line-height: 16px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        @media (min-width: 640px) {
          .og-search-modal-wrapper {
            top: 0 !important;
            left: 50% !important;
            right: auto !important;
            transform: translateX(-50%);
            margin-top: 10vh;
            width: 100%;
            max-width: 42rem;
            padding: 0 1rem;
          }
          .og-search-panel {
            height: auto !important;
            max-height: 65vh;
            border-radius: 14px;
          }
          .og-search-row {
            padding-left: 16px;
            padding-right: 16px;
            gap: 12px;
          }
        }
      `}</style>

      {/* Modal */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: event stops propagation to prevent close-on-outside-click */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick here is purely a stopPropagation guard, no user-facing action triggered */}
      <div className="og-search-modal-wrapper fixed z-[80]" onClick={(e) => e.stopPropagation()}>
        <div
          className="og-search-panel w-full flex flex-col overflow-hidden"
          style={{
            background: "var(--color-background-surface)",
            boxShadow: "var(--shadow-xl)",
            border: "1px solid var(--color-border-default)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Search the registry"
        >
          {/* Search input row */}
          <div className="og-search-row flex items-center border-b border-border-default flex-none py-3 sm:py-3.5">
            {/* Mobile-only back button */}
            <button
              type="button"
              onClick={close}
              className="sm:hidden flex-none -ml-1 w-11 h-11 self-center rounded-full flex items-center justify-center text-text-heading active:bg-[var(--color-background-subtle)] transition-colors"
              aria-label="Close search"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div ref={searchWrapperRef} className="og-search-textfield-wrapper flex-1 min-w-0 self-center">
              <TextField
                aria-label="Search the registry"
                value={query}
                onChange={setQuery}
                onKeyDown={handleKeyDown}
                placeholder="Search the registry"
                showSearchIcon
                isClearable
                onClear={() => {
                  setQuery("");
                  focusInput();
                }}
                isLoading={isLoading}
                size="md"
                transparent
                reserveErrorSpace={false}
                autoComplete="off"
              />
            </div>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: kbd visually acts as a dismiss hint, onClick is non-critical */}
            <kbd
              onClick={close}
              className="hidden sm:flex flex-none self-center items-center px-2 py-1 ml-2 rounded-md border border-border-default bg-[var(--color-background-subtle)] text-text-muted text-[11px] font-mono cursor-pointer hover:bg-border-default transition-colors select-none"
            >
              esc
            </kbd>
          </div>

          {/* Results / Empty state */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {/* Empty state — "Browse" rows */}
            {query.trim() === "" && (
              <div className="py-4 sm:py-3">
                <div className="og-search-section-label text-text-muted px-5 sm:px-5 pb-3 sm:pb-2">Browse</div>
                <div className="px-2 sm:px-3">
                  {QUICK_LINKS.map((link) => (
                    <button
                      key={link.href}
                      type="button"
                      onClick={() => {
                        posthog.capture("registry_browse_category_selected", { entity_type: link.kind });
                        router.push(link.href);
                        close();
                      }}
                      className="w-full flex items-center gap-4 sm:gap-3 px-3 py-3 sm:py-2.5 rounded-xl sm:rounded-lg text-left hover:bg-[var(--color-background-subtle)] active:bg-[var(--color-background-subtle)] transition-colors group"
                    >
                      <span
                        className={`flex-none w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center ${link.tileBg}`}
                      >
                        <span className={`w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full ${link.dotColor}`} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[16px] sm:text-sm font-semibold text-text-heading leading-tight">
                          {link.label}
                        </div>
                        <div className="text-[13px] sm:text-xs text-text-muted leading-tight mt-0.5">
                          {link.subtitle}
                        </div>
                      </div>
                      <Icon
                        name="ArrowRight"
                        size={16}
                        className="flex-none text-text-muted opacity-40 group-hover:opacity-70 transition-opacity"
                      />
                    </button>
                  ))}
                </div>
                {/* Tip — desktop only */}
                <div className="hidden sm:flex mt-3 mx-5 pt-3 border-t border-border-default items-center gap-2">
                  <span className="text-xs text-text-muted">Tip:</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-border-default bg-[var(--color-background-subtle)] text-text-muted text-[10px] font-mono">
                    ⌘K
                  </kbd>
                  <span className="text-xs text-text-muted">opens search from anywhere</span>
                </div>
              </div>
            )}

            {/* No results */}
            {query.trim().length >= 2 && debouncedQuery === query && results.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center px-6 py-16 sm:py-12 gap-3 text-text-muted">
                <div className="w-14 h-14 rounded-2xl bg-[var(--color-background-subtle)] flex items-center justify-center mb-1">
                  <Icon name="MagnifyingGlass" size={22} className="opacity-40" />
                </div>
                <p className="text-base sm:text-sm font-semibold text-text-heading">
                  No results for &ldquo;{query}&rdquo;
                </p>
                <p className="text-sm sm:text-xs opacity-60 text-center max-w-xs">
                  Try a different name, ID, or location — or browse the categories from the empty state.
                </p>
              </div>
            )}

            {/* Results grouped by entity type */}
            {grouped.length > 0 && (
              <div className="py-2 sm:py-2">
                {grouped.map((group, groupIdx) => (
                  <div key={group.kind} className={groupIdx === 0 ? "" : "mt-2 sm:mt-1"}>
                    <div className="og-search-section-label text-text-muted px-5 sm:px-5 pt-3 pb-2">{group.label}</div>
                    <div className="px-2 sm:px-3">
                      {group.items.map((result) => {
                        const idx = flatIndex++;
                        const isActive = idx === activeIndex;
                        return (
                          <button
                            key={`${result.kind}-${result.slug}`}
                            type="button"
                            className={`w-full flex items-center gap-4 sm:gap-3 px-3 py-3 sm:py-2.5 rounded-xl sm:rounded-lg text-left transition-colors group ${
                              isActive
                                ? "bg-[var(--color-background-subtle)]"
                                : "hover:bg-[var(--color-background-subtle)] active:bg-[var(--color-background-subtle)]"
                            }`}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => navigateTo(result)}
                          >
                            <span
                              className={`flex-none w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center ${
                                ENTITY_BY_KIND[result.kind]?.tileBg ?? KIND_TILE_BG_FALLBACK
                              }`}
                            >
                              <span
                                className={`w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full ${result.dotColor ?? KIND_DOT_COLOR_FALLBACK}`}
                              />
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[16px] sm:text-sm font-semibold text-text-heading truncate leading-tight">
                                {result.name}
                              </div>
                              {result.subtitle && (
                                <div className="text-[13px] sm:text-xs text-text-muted truncate mt-0.5 leading-tight">
                                  {result.subtitle}
                                </div>
                              )}
                            </div>
                            <Icon
                              name="ArrowRight"
                              size={16}
                              className={`flex-none text-text-muted transition-opacity ${isActive ? "opacity-60" : "opacity-0 group-hover:opacity-40"}`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer — keyboard hints (desktop only) */}
          <div className="hidden sm:flex flex-none px-5 py-2.5 border-t border-border-default items-center justify-between bg-[var(--color-background-subtle)]">
            <div className="flex items-center gap-3 text-[11px] text-text-muted">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded border border-border-default bg-background-surface font-mono text-[10px] shadow-sm">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded border border-border-default bg-background-surface font-mono text-[10px] shadow-sm">
                  ↵
                </kbd>
                open
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded border border-border-default bg-background-surface font-mono text-[10px] shadow-sm">
                  esc
                </kbd>
                close
              </span>
            </div>
            {results.length > 0 && (
              <span className="text-[11px] text-text-muted tabular-nums">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
