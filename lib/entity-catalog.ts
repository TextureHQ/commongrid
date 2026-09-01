/**
 * Entity Catalog — Single Source of Truth
 * ------------------------------------------------------------------
 *
 * Every browseable entity type in CommonGrid is defined here. The
 * GlobalSearch "Browse" suggestions, the search-result grouping, and
 * any other place that needs to enumerate "things you can find in
 * CommonGrid" should consume this catalog so they stay in sync.
 *
 * If you add a new dataset (e.g. distribution feeders), add a single
 * entry here and it ripples everywhere.
 *
 * Counts are kept as static module imports and resolved at build
 * time (no async fetch). They are the *registry* count, not a live
 * DB count — close enough for a discoverability surface.
 */

import basData from "@/data/balancing-authorities.json";
import isosData from "@/data/isos.json";
import programsData from "@/data/programs.json";
import rtosData from "@/data/rtos.json";

// Hardcoded counts for the big datasets — these JSON files live in
// /public/data and are only loaded on demand by the search modal.
// For the catalog, we only need approximate sizes for the Browse
// labels. The values here track data/<dataset>.json on disk; if a
// number drifts, sync scripts will catch it on the next run.
const STATIC_COUNTS = {
  utilities: 3_133,
  powerPlants: 15_927,
  evCharging: 85_425,
  pricingNodes: 4_065,
  transmissionLines: 52_244,
  substations: 73_799,
} as const;

const programsCount = (programsData as unknown[]).length;
const isosCount = (isosData as unknown[]).length;
const rtosCount = (rtosData as unknown[]).length;
const basCount = (basData as unknown[]).length;

export type EntityKind =
  | "utility"
  | "iso"
  | "rto"
  | "ba"
  | "power-plant"
  | "ev-station"
  | "pricing-node"
  | "program"
  | "transmission-line"
  | "substation";

export interface EntityCatalogEntry {
  /** Kind id used by the search result router. */
  kind: EntityKind;
  /** Display label used in section headers and Browse cards. */
  label: string;
  /** Plural noun used in the "X items" subtitle on Browse cards. */
  noun: string;
  /** Approximate count of entities of this kind in CommonGrid. */
  count: number;
  /** Listing-page URL — where the "Browse all" tap takes you. */
  href: string;
  /** Whether this kind shows up in the Browse list (empty state). */
  inBrowse: boolean;
  /** Whether this kind participates in the typed-search results. */
  inSearch: boolean;
  /** Tailwind color class for the dot. */
  dotColor: string;
  /** Tailwind background class for the kind-tile (lighter shade). */
  tileBg: string;
}

/**
 * Browse-list order is the order entries appear here. Search-result
 * grouping uses the same order.
 *
 * Hrefs are verified by hand against app/(shell)/*. If a new listing
 * page lands, just point the entry at the new route.
 */
export const ENTITY_CATALOG: EntityCatalogEntry[] = [
  {
    kind: "utility",
    label: "Utilities",
    noun: "utilities",
    count: STATIC_COUNTS.utilities,
    href: "/grid-operators",
    inBrowse: true,
    inSearch: true,
    dotColor: "bg-slate-400",
    tileBg: "bg-slate-100",
  },
  {
    kind: "iso",
    label: "ISOs & RTOs",
    noun: "operators",
    count: isosCount + rtosCount,
    href: "/grid-operators",
    inBrowse: true,
    inSearch: true,
    dotColor: "bg-amber-400",
    tileBg: "bg-amber-100",
  },
  {
    kind: "ba",
    label: "Balancing Authorities",
    noun: "authorities",
    count: basCount,
    href: "/grid-operators",
    inBrowse: true,
    inSearch: true,
    dotColor: "bg-amber-400",
    tileBg: "bg-amber-100",
  },
  {
    kind: "power-plant",
    label: "Power Plants",
    noun: "plants",
    count: STATIC_COUNTS.powerPlants,
    href: "/power-plants",
    inBrowse: true,
    inSearch: true,
    dotColor: "bg-teal-400",
    tileBg: "bg-teal-100",
  },
  {
    kind: "transmission-line",
    label: "Transmission Lines",
    noun: "lines",
    count: STATIC_COUNTS.transmissionLines,
    href: "/transmission-lines",
    inBrowse: true,
    // Not yet searchable — file is large and we don't index transmission
    // lines by name; surface as a Browse destination only.
    inSearch: false,
    dotColor: "bg-purple-400",
    tileBg: "bg-purple-100",
  },
  {
    kind: "substation",
    label: "Substations",
    noun: "substations",
    count: STATIC_COUNTS.substations,
    href: "/substations",
    inBrowse: true,
    // Not in the omnibox index yet; explore the listing page.
    inSearch: false,
    dotColor: "bg-fuchsia-400",
    tileBg: "bg-fuchsia-100",
  },
  {
    kind: "ev-station",
    label: "EV Charging",
    noun: "stations",
    count: STATIC_COUNTS.evCharging,
    href: "/ev-charging",
    inBrowse: true,
    inSearch: true,
    dotColor: "bg-green-400",
    tileBg: "bg-green-100",
  },
  {
    kind: "pricing-node",
    label: "Pricing Nodes",
    noun: "nodes",
    count: STATIC_COUNTS.pricingNodes,
    href: "/pricing-nodes",
    inBrowse: true,
    inSearch: true,
    dotColor: "bg-yellow-400",
    tileBg: "bg-yellow-100",
  },
  {
    kind: "program",
    label: "Programs",
    noun: "programs",
    count: programsCount,
    href: "/explore/programs",
    inBrowse: true,
    inSearch: true,
    dotColor: "bg-indigo-400",
    tileBg: "bg-indigo-100",
  },
];

/**
 * Search-only kinds — distinct entity types that appear in the search
 * result list but are folded into a parent Browse card. RTOs live
 * under "ISOs & RTOs" in Browse, but the search index keeps them as
 * a separate kind so a user can find e.g. "PJM" or "MISO" directly.
 */
export const SEARCH_ONLY_KINDS: EntityCatalogEntry[] = [
  {
    kind: "rto",
    label: "RTOs",
    noun: "operators",
    count: rtosCount,
    href: "/grid-operators",
    inBrowse: false,
    inSearch: true,
    dotColor: "bg-amber-400",
    tileBg: "bg-amber-100",
  },
];

const ALL_KINDS: EntityCatalogEntry[] = [...ENTITY_CATALOG, ...SEARCH_ONLY_KINDS];

/** Convenience lookup keyed by `kind`. */
export const ENTITY_BY_KIND: Record<EntityKind, EntityCatalogEntry> = Object.fromEntries(
  ALL_KINDS.map((e) => [e.kind, e])
) as Record<EntityKind, EntityCatalogEntry>;

/** Browse-list entries (empty-state suggestions). */
export const BROWSE_ENTRIES = ENTITY_CATALOG.filter((e) => e.inBrowse);

/** Total entity count across all kinds — used in registry copy. */
export const TOTAL_ENTITIES = ENTITY_CATALOG.reduce((sum, e) => sum + e.count, 0);
