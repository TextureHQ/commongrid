"use client";

import { Icon } from "@texturehq/edges";
import Fuse from "fuse.js";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  getAllBalancingAuthorities,
  getAllIsos,
  getAllPrograms,
  getAllRtos,
  getAllUtilities,
} from "@/lib/data";
import type { BalancingAuthority, Iso, Rto, Utility } from "@/types/entities";
import type { Program } from "@/types/programs";
import type { PricingNode } from "@/types/pricing-nodes";
import type { EVStation } from "@/types/ev-charging";
import type { PowerPlant } from "@/types/entities";

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

  return (
    <GlobalSearchContext.Provider value={{ isOpen, open, close }}>
      {children}
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch(): GlobalSearchContextValue {
  return useContext(GlobalSearchContext);
}

// ---------------------------------------------------------------------------
// Search result types
// ---------------------------------------------------------------------------

type EntityKind =
  | "utility"
  | "iso"
  | "rto"
  | "ba"
  | "power-plant"
  | "ev-station"
  | "pricing-node"
  | "program";

interface SearchResult {
  kind: EntityKind;
  slug: string;
  name: string;
  subtitle: string;
  href: string;
  dotColor: string;
}

const KIND_LABELS: Record<EntityKind, string> = {
  utility: "Utilities",
  iso: "ISOs",
  rto: "RTOs",
  ba: "Balancing Authorities",
  "power-plant": "Power Plants",
  "ev-station": "EV Charging",
  "pricing-node": "Pricing Nodes",
  program: "Programs",
};

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

const KIND_DOT_COLOR: Record<EntityKind, string> = {
  utility: "bg-slate-400",
  iso: "bg-amber-400",
  rto: "bg-amber-400",
  ba: "bg-amber-400",
  "power-plant": "bg-teal-400",
  "ev-station": "bg-green-400",
  "pricing-node": "bg-yellow-400",
  program: "bg-indigo-400",
};

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Tier-2 async data
  const [plants, setPlants] = useState<SlimPlant[] | null>(null);
  const [stations, setStations] = useState<SlimStation[] | null>(null);
  const [pricingNodes, setPricingNodes] = useState<PricingNode[] | null>(null);

  // Track fetch state
  const [loadingAsync, setLoadingAsync] = useState(false);

  // Tier-1 static data (synchronous, already bundled)
  const utilities = useMemo(() => getAllUtilities(), []);
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
  const plantFuse = useMemo(
    () => (plants ? buildPlantFuse(plants) : null),
    [plants]
  );
  const stationFuse = useMemo(
    () => (stations ? buildStationFuse(stations) : null),
    [stations]
  );
  const pricingNodeFuse = useMemo(
    () => (pricingNodes ? buildPricingNodeFuse(pricingNodes) : null),
    [pricingNodes]
  );

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

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
  }, [isOpen]);

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  // Build results
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim();
    if (!q) return [];

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
      ? plantFuse.search(q).slice(0, MAX_PER_KIND).map((r) => plantToResult(r.item))
      : [];
    const stationResults = stationFuse
      ? stationFuse.search(q).slice(0, MAX_PER_KIND).map((r) => stationToResult(r.item))
      : [];
    const pricingNodeResults = pricingNodeFuse
      ? pricingNodeFuse.search(q).slice(0, MAX_PER_KIND).map((r) => pricingNodeToResult(r.item))
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
  }, [
    query,
    utilityFuse,
    isoFuse,
    rtoFuse,
    baFuse,
    plantFuse,
    stationFuse,
    pricingNodeFuse,
    programFuse,
  ]);

  // Group results by kind (maintain KIND_ORDER order)
  const grouped = useMemo<Array<{ kind: EntityKind; label: string; items: SearchResult[] }>>(() => {
    const map = new Map<EntityKind, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.kind)) map.set(r.kind, []);
      map.get(r.kind)!.push(r);
    }
    return KIND_ORDER.filter((k) => map.has(k)).map((k) => ({
      kind: k,
      label: KIND_LABELS[k],
      items: map.get(k)!,
    }));
  }, [results]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="w-full max-w-xl bg-[var(--color-background-surface)] rounded-2xl shadow-2xl border border-border-default overflow-hidden flex flex-col"
        style={{ maxHeight: "70vh" }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default flex-none">
          <Icon name="MagnifyingGlass" size={18} className="text-text-muted flex-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search utilities, programs, ISOs, power plants..."
            className="flex-1 bg-transparent text-sm text-text-body placeholder:text-text-muted outline-none"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {loadingAsync && (
            <div className="flex-none w-4 h-4 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
          )}
          <kbd
            onClick={close}
            className="flex-none hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border-default bg-[var(--color-background-subtle)] text-text-muted text-xs font-mono cursor-pointer hover:border-border-strong transition-colors"
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {query.trim() === "" && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted">
              <Icon name="MagnifyingGlass" size={28} className="opacity-30" />
              <p className="text-sm">Type to search the OpenGrid registry</p>
              <p className="text-xs opacity-60">Utilities, ISOs, power plants, programs, and more</p>
            </div>
          )}

          {query.trim() !== "" && results.length === 0 && !loadingAsync && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted">
              <Icon name="MagnifyingGlass" size={28} className="opacity-30" />
              <p className="text-sm">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs opacity-60">Try a different search term</p>
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.kind}>
              {/* Section header */}
              <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted bg-[var(--color-background-subtle)] border-b border-border-default sticky top-0">
                {group.label}
              </div>
              {group.items.map((result) => {
                const idx = flatIndex++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={`${result.kind}-${result.slug}`}
                    type="button"
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border-default last:border-0 ${
                      isActive
                        ? "bg-[var(--color-background-subtle)]"
                        : "hover:bg-[var(--color-background-subtle)]"
                    }`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => navigateTo(result)}
                  >
                    <span
                      className={`flex-none w-2.5 h-2.5 rounded-full ${result.dotColor}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-heading truncate">
                        {result.name}
                      </div>
                      {result.subtitle && (
                        <div className="text-xs text-text-muted truncate mt-0.5">
                          {result.subtitle}
                        </div>
                      )}
                    </div>
                    <Icon
                      name="ArrowRight"
                      size={14}
                      className="flex-none text-text-muted opacity-50"
                    />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="flex-none px-4 py-2 border-t border-border-default flex items-center justify-between">
            <span className="text-xs text-text-muted">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-border-default bg-[var(--color-background-subtle)] font-mono text-[10px]">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-border-default bg-[var(--color-background-subtle)] font-mono text-[10px]">↵</kbd>
                open
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
