"use client";

import { Icon, TextField } from "@texturehq/edges";
import Fuse from "fuse.js";
import { useRouter } from "next/navigation";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAllBalancingAuthorities, getAllIsos, getAllPrograms, getAllRtos } from "@/lib/data";
import { BROWSE_ENTRIES, ENTITY_BY_KIND, type EntityKind } from "@/lib/entity-catalog";
import { useUtilities } from "@/lib/utilities-client";
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

// EntityKind, labels, colors, browse list, and counts all live in the
// shared catalog (lib/entity-catalog.ts) so the empty-state suggestions
// and the search-result groups stay in sync with the actual datasets
// we ship. Adding a new dataset = adding one catalog entry; this
// component re-derives everything.

interface SearchResult {
  kind: EntityKind;
  slug: string;
  name: string;
  subtitle: string;
  href: string;
  dotColor: string;
}

// Order in which kinds appear in the search-result list. Matches the
// catalog order, with RTOs slotted in next to ISOs.
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

// Flat lookup maps derived from the catalog — keep the per-result
// `dotColor: KIND_DOT_COLOR.<kind>` callsites concise. Falls back to
// a neutral slate color for any kind that doesn't have an explicit
// entry, so we can't crash on a newly added kind that hasn't been
// wired up here yet.
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
const MAX_TOTAL = 30;

// ---------------------------------------------------------------------------
// Tiny lightweight types for async datasets
// ---------------------------------------------------------------------------

interface SlimPlant {
  slug: string;
  name: string;
  state: string;
  utilityName: string;
  fuelCategory: string;
}

interface SlimStation {
  slug: string;
  stationName: string;
  city: string;
  state: string;
  evNetwork: string | null;
}

// ---------------------------------------------------------------------------
// Build Fuse indices for tier-1 data
// ---------------------------------------------------------------------------

function buildUtilityFuse(utilities: Utility[]): Fuse<Utility> {
  return new Fuse(utilities, {
    threshold: 0.3,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 0.6 },
      { name: "shortName", weight: 0.3 },
      { name: "jurisdiction", weight: 0.1 },
    ],
  });
}

function buildIsoFuse(isos: Iso[]): Fuse<Iso> {
  return new Fuse(isos, {
    threshold: 0.3,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 0.6 },
      { name: "shortName", weight: 0.3 },
      { name: "states", weight: 0.1 },
    ],
  });
}

function buildRtoFuse(rtos: Rto[]): Fuse<Rto> {
  return new Fuse(rtos, {
    threshold: 0.3,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 0.6 },
      { name: "shortName", weight: 0.3 },
      { name: "states", weight: 0.1 },
    ],
  });
}

function buildBaFuse(bas: BalancingAuthority[]): Fuse<BalancingAuthority> {
  return new Fuse(bas, {
    threshold: 0.3,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 0.6 },
      { name: "shortName", weight: 0.3 },
      { name: "states", weight: 0.1 },
    ],
  });
}

function buildPricingNodeFuse(nodes: PricingNode[]): Fuse<PricingNode> {
  return new Fuse(nodes, {
    threshold: 0.3,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 0.7 },
      { name: "iso", weight: 0.2 },
      { name: "state", weight: 0.1 },
    ],
  });
}

function buildProgramFuse(programs: Program[]): Fuse<Program> {
  return new Fuse(programs, {
    threshold: 0.3,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 0.8 },
      { name: "regions", weight: 0.2 },
    ],
  });
}

function buildPlantFuse(plants: SlimPlant[]): Fuse<SlimPlant> {
  return new Fuse(plants, {
    threshold: 0.3,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 0.6 },
      { name: "state", weight: 0.2 },
      { name: "utilityName", weight: 0.2 },
    ],
  });
}

function buildStationFuse(stations: SlimStation[]): Fuse<SlimStation> {
  return new Fuse(stations, {
    threshold: 0.3,
    ignoreLocation: true,
    keys: [
      { name: "stationName", weight: 0.6 },
      { name: "city", weight: 0.2 },
      { name: "state", weight: 0.2 },
    ],
  });
}

// ---------------------------------------------------------------------------
// Helpers to convert to SearchResult
// ---------------------------------------------------------------------------

function utilityToResult(u: Utility): SearchResult {
  return {
    kind: "utility",
    slug: u.slug,
    name: u.name,
    subtitle: [u.jurisdiction, u.segment].filter(Boolean).join(" · "),
    href: `/grid-operators/${u.slug}`,
    dotColor: KIND_DOT_COLOR.utility,
  };
}

function isoToResult(iso: Iso): SearchResult {
  return {
    kind: "iso",
    slug: iso.slug,
    name: iso.name,
    subtitle: `ISO · ${iso.shortName}`,
    href: `/grid-operators/${iso.slug}`,
    dotColor: KIND_DOT_COLOR.iso,
  };
}

function rtoToResult(rto: Rto): SearchResult {
  return {
    kind: "rto",
    slug: rto.slug,
    name: rto.name,
    subtitle: `RTO · ${rto.shortName}`,
    href: `/grid-operators/${rto.slug}`,
    dotColor: KIND_DOT_COLOR.rto,
  };
}

function baToResult(ba: BalancingAuthority): SearchResult {
  return {
    kind: "ba",
    slug: ba.slug,
    name: ba.name,
    subtitle: `Balancing Authority · ${ba.shortName}`,
    href: `/grid-operators/${ba.slug}`,
    dotColor: KIND_DOT_COLOR.ba,
  };
}

function pricingNodeToResult(node: PricingNode): SearchResult {
  return {
    kind: "pricing-node",
    slug: node.slug,
    name: node.name,
    subtitle: [node.iso, node.state].filter(Boolean).join(" · "),
    href: `/pricing-nodes/${node.slug}`,
    dotColor: KIND_DOT_COLOR["pricing-node"],
  };
}

function programToResult(program: Program): SearchResult {
  return {
    kind: "program",
    slug: program.slug,
    name: program.name,
    subtitle: `Program · ${program.status}`,
    href: `/explore?tab=programs&slug=${program.slug}`,
    dotColor: KIND_DOT_COLOR.program,
  };
}

function plantToResult(plant: SlimPlant): SearchResult {
  return {
    kind: "power-plant",
    slug: plant.slug,
    name: plant.name,
    subtitle: [plant.fuelCategory, plant.state].filter(Boolean).join(" · "),
    href: `/power-plants/${plant.slug}`,
    dotColor: KIND_DOT_COLOR["power-plant"],
  };
}

function stationToResult(station: SlimStation): SearchResult {
  return {
    kind: "ev-station",
    slug: station.slug,
    name: station.stationName,
    subtitle: [station.evNetwork, station.city, station.state].filter(Boolean).join(" · "),
    href: `/ev-charging/${station.slug}`,
    dotColor: KIND_DOT_COLOR["ev-station"],
  };
}

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

export function GlobalSearchModal() {
  const { isOpen, close } = useGlobalSearch();
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Deferred query keeps the input itself responsive while the Fuse
  // pipeline catches up on slower devices. Combined with the 2-char
  // minimum below, this kills the perceived sluggishness on mobile.
  const deferredQuery = useDeferredValue(query);
  // Wrap the TextField in a div ref so we can imperatively focus the
  // inner <input>. The edges TextField doesn't forward a ref to its
  // <input>, so we reach in via DOM query — not pretty, but it's the
  // approved escape hatch (TextField is built on react-aria-components
  // which manages the input internally).
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const focusInput = useCallback(() => {
    const el = searchWrapperRef.current?.querySelector("input");
    el?.focus();
  }, []);
  const [activeIndex, setActiveIndex] = useState(0);

  // Tier-2 async data
  const [plants, setPlants] = useState<SlimPlant[] | null>(null);
  const [stations, setStations] = useState<SlimStation[] | null>(null);
  const [pricingNodes, setPricingNodes] = useState<PricingNode[] | null>(null);

  // Track fetch state
  const [loadingAsync, setLoadingAsync] = useState(false);

  // Tier-1 static data
  const { utilities } = useUtilities();
  const isos = useMemo(() => getAllIsos(), []);
  const rtos = useMemo(() => getAllRtos(), []);
  const bas = useMemo(() => getAllBalancingAuthorities(), []);
  const programs = useMemo(() => getAllPrograms(), []);

  // Build tier-1 Fuse indices once (not on each query)
  const utilityFuse = useMemo(() => buildUtilityFuse(utilities), [utilities]);
  const isoFuse = useMemo(() => buildIsoFuse(isos), [isos]);
  const rtoFuse = useMemo(() => buildRtoFuse(rtos), [rtos]);
  const baFuse = useMemo(() => buildBaFuse(bas), [bas]);
  const programFuse = useMemo(() => buildProgramFuse(programs), [programs]);

  // Build tier-2 Fuse indices once data is loaded
  const plantFuse = useMemo(() => (plants ? buildPlantFuse(plants) : null), [plants]);
  const stationFuse = useMemo(() => (stations ? buildStationFuse(stations) : null), [stations]);
  const pricingNodeFuse = useMemo(() => (pricingNodes ? buildPricingNodeFuse(pricingNodes) : null), [pricingNodes]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => focusInput(), 50);
    }
  }, [isOpen, focusInput]);

  // Fetch tier-2 data on open
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const pending: Promise<void>[] = [];

    if (!plants) {
      const p = fetch("/data/power-plants.json")
        .then((r) => r.json())
        .then((data: PowerPlant[]) => {
          if (!cancelled) {
            setPlants(
              data.map((d) => ({
                slug: d.slug,
                name: d.name,
                state: d.state,
                utilityName: d.utilityName,
                fuelCategory: d.fuelCategory,
              }))
            );
          }
        })
        .catch(() => {});
      pending.push(p);
    }

    if (!stations) {
      const p = fetch("/data/ev-charging.json")
        .then((r) => r.json())
        .then((data: EVStation[]) => {
          if (!cancelled) {
            setStations(
              data.map((d) => ({
                slug: d.slug,
                stationName: d.stationName,
                city: d.city,
                state: d.state,
                evNetwork: d.evNetwork,
              }))
            );
          }
        })
        .catch(() => {});
      pending.push(p);
    }

    if (!pricingNodes) {
      const p = fetch("/data/pricing-nodes.json")
        .then((r) => r.json())
        .then((data: PricingNode[]) => {
          if (!cancelled) {
            setPricingNodes(data);
          }
        })
        .catch(() => {});
      pending.push(p);
    }

    if (pending.length > 0) {
      setLoadingAsync(true);
      Promise.all(pending).finally(() => {
        if (!cancelled) setLoadingAsync(false);
      });
    }

    return () => {
      cancelled = true;
    };
    // Only run when modal opens; we intentionally don't re-run when plants/stations/pricingNodes change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, plants, pricingNodes, stations]);

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  // Build results — driven by the *deferred* query so typing stays
  // smooth even when the Fuse pipeline takes ~30-60ms per keystroke.
  const results = useMemo<SearchResult[]>(() => {
    const q = deferredQuery.trim();
    if (!q) return [];
    // Skip single-character queries: Fuse returns hundreds of poor matches
    // and renders are expensive. Two characters is the conventional floor.
    if (q.length < 2) return [];

    const out: SearchResult[] = [];

    const utilityResults = utilityFuse
      .search(q)
      .slice(0, MAX_PER_KIND)
      .map((r) => utilityToResult(r.item));
    const isoResults = isoFuse
      .search(q)
      .slice(0, MAX_PER_KIND)
      .map((r) => isoToResult(r.item));
    const rtoResults = rtoFuse
      .search(q)
      .slice(0, MAX_PER_KIND)
      .map((r) => rtoToResult(r.item));
    const baResults = baFuse
      .search(q)
      .slice(0, MAX_PER_KIND)
      .map((r) => baToResult(r.item));
    const plantResults = plantFuse
      ? plantFuse
          .search(q)
          .slice(0, MAX_PER_KIND)
          .map((r) => plantToResult(r.item))
      : [];
    const stationResults = stationFuse
      ? stationFuse
          .search(q)
          .slice(0, MAX_PER_KIND)
          .map((r) => stationToResult(r.item))
      : [];
    const pricingNodeResults = pricingNodeFuse
      ? pricingNodeFuse
          .search(q)
          .slice(0, MAX_PER_KIND)
          .map((r) => pricingNodeToResult(r.item))
      : [];
    const programResults = programFuse
      .search(q)
      .slice(0, MAX_PER_KIND)
      .map((r) => programToResult(r.item));

    out.push(
      ...utilityResults,
      ...isoResults,
      ...rtoResults,
      ...baResults,
      ...plantResults,
      ...stationResults,
      ...pricingNodeResults,
      ...programResults
    );

    return out.slice(0, MAX_TOTAL);
  }, [deferredQuery, utilityFuse, isoFuse, rtoFuse, baFuse, plantFuse, stationFuse, pricingNodeFuse, programFuse]);

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
      router.push(result.href);
      close();
    },
    [router, close]
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

  // Browse-list entries come from the central catalog so adding a new
  // dataset elsewhere automatically surfaces here. Labels, counts,
  // hrefs, AND dot/tile colors are the single source of truth in
  // lib/entity-catalog.ts — we project them onto the row shape the
  // empty-state UI expects, including the lighter tile background
  // (e.g. bg-amber-100) that pairs with the dot color (bg-amber-400).
  const QUICK_LINKS = BROWSE_ENTRIES.map((entry) => ({
    label: entry.label,
    href: entry.href,
    kind: entry.kind,
    subtitle: `${entry.count.toLocaleString("en-US")} ${entry.noun}`,
    dotColor: entry.dotColor,
    tileBg: entry.tileBg,
  }));

  return (
    <>
      {/* Backdrop — covers the full viewport on mobile (including the
          nav area, since the search sheet itself takes over the screen),
          and dims everything behind the floating panel on desktop.

          z-index: must sit ABOVE the sticky top nav (z-60) so the modal
          actually covers the nav on mobile. Backdrop is z-[70], sheet
          wrapper is z-[80].

          Click vs touch: only respond to onClick, NOT onMouseDown /
          onTouchStart. iOS Safari fires touchstart on whatever's under
          the finger when a new layer appears, so listening to touchstart
          would close the modal in the same gesture that opened it (the
          original "tap does nothing" bug). Click fires after touchend,
          which is exactly what we want. */}
      <div
        className="fixed inset-0 z-[70]"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        onClick={close}
        aria-hidden="true"
      />

      {/* Modal positioning styles
         • Mobile: true full-screen sheet (top:0, 100dvh) so the keyboard
           doesn't shove the panel around and we get the full viewport
           for results. Uses `dvh` so iOS Safari accounts for the URL bar.
         • Desktop: centered floating panel as before. */}
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
        /* Let the edges TextField size itself (via size="xl" on mobile,
           the design-system default). We only need two things from
           this stylesheet: the wrapper takes full width so the input
           fills the row, and the iOS Safari pseudo cancel button on
           type=search is hidden (we render our own clear via
           TextField's isClearable prop).

           iOS zoom safety: edges size="xl" font-size is ≥ 16px so no
           extra rule is needed here. */
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

      {/* Modal — full-screen sheet on mobile, floating centered on desktop.
          Sits one layer above the backdrop so taps on the panel itself
          never reach the backdrop's onClick handler. Both backdrop and
          sheet are above the sticky top nav (z-60). */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: event stops propagation to prevent close-on-outside-click */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick here is purely a stopPropagation guard, no user-facing action triggered */}
      <div className="og-search-modal-wrapper fixed z-[80]" onClick={(e) => e.stopPropagation()}>
        <div
          className="og-search-panel w-full flex flex-col overflow-hidden"
          style={{
            background: "var(--color-background-surface)",
            boxShadow:
              "0 32px 64px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Search the registry"
        >
          {/* Search input row — uses the edges TextField configured as a
             search input (size=xl on mobile, lg on desktop) for full
             design-system consistency. The mobile-only back button on
             the left anchors the sheet as a navigation destination;
             the esc hint on the right is desktop-only. */}
          {/* Let the row collapse to the natural height of the edges
             TextField + 12px top/bottom padding (mobile) / 14px (desktop).
             No fixed height — the design system owns it. */}
          <div className="og-search-row flex items-center border-b border-border-default flex-none py-3 sm:py-3.5">
            {/* Mobile-only back button. iOS-style chevron, 44px target. */}
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
                isLoading={loadingAsync}
                size="lg"
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
            {/* Empty state — "Browse" rows rendered with prominence:
               40px kind-tiles on mobile, generous 16px section padding,
               clean type pair. The earlier 8px dots looked cramped at
               phone density and didn't read as actionable; the tiles do. */}
            {query.trim() === "" && (
              <div className="py-4 sm:py-3">
                <div className="og-search-section-label text-text-muted px-5 sm:px-5 pb-3 sm:pb-2">Browse</div>
                <div className="px-2 sm:px-3">
                  {QUICK_LINKS.map((link) => (
                    <button
                      key={link.href}
                      type="button"
                      onClick={() => {
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

            {/* No results — only show once the deferred query has caught
               up. Otherwise we'd flash this banner on every keystroke. */}
            {query.trim().length >= 2 && deferredQuery === query && results.length === 0 && !loadingAsync && (
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

            {/* Results grouped by entity type. Each section starts with a
               proper uppercase label with generous breathing room, then
               taller rows (60px on mobile) with a real kind-tile, 15px
               semibold name and 13px muted subtitle. */}
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
