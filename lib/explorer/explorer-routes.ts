/**
 * Pure route-stack model for the CommonGrid explore surface.
 *
 * The explore surface is a *stack* of routes serialized to the URL. This
 * module owns the shape of that stack and the URL ↔ stack mapping, kept free
 * of React / the edges hook / the DOM so the grammar is unit-testable.
 *
 * ## Programs are nested under their administrator utility
 *
 * A program is never a free-standing peer entity in the stack. Because a
 * program always belongs to a utility, drilling into a program pushes it on
 * top of its administrator utility:
 *
 *   [overview, list(utilities), detail(utility=admin), detail(program)]
 *
 * so the back-arrow pops program → administrator utility → utilities list.
 * This holds regardless of entry point: reaching a program from global search
 * (`?tab=programs&slug=<program>`) synthesizes the administrator utility
 * beneath it, producing the exact same nested shape as a drill-in from the
 * utility panel. See CG-252.
 *
 * The administrator utility is resolved through an injected
 * `ProgramAdminResolver` so this module stays dependency-free; the provider
 * passes the real `lib/data` lookup, tests pass a stub. When a program has no
 * resolvable administrator utility, it degrades to a standalone program detail
 * under the programs list (incomplete is acceptable; a crash is not).
 */

import type { ExploreViewMode } from "@/lib/explorer/view-mode";
import { parseViewMode } from "@/lib/explorer/view-mode";

export type EntityTab =
  | "utilities"
  | "grid-operators"
  | "power-plants"
  | "programs"
  | "rates"
  | "transmission-lines"
  | "ev-charging"
  | "pricing-nodes"
  | "substations";

export interface ListRoutePayload {
  tab: EntityTab;
  q: string;
  segment: string;
  type: string;
  jurisdictions: string[];
  mode: ExploreViewMode;
}

export interface DetailRoutePayload {
  /** The entity type of THIS detail route — drives which panel renders. */
  entityKind: EntityTab;
  slug: string;
}

/**
 * A route descriptor shape structurally compatible with
 * `@texturehq/edges-explore`'s `ExploreRouteDescriptor` (which only requires
 * `{ type; id }` plus an optional payload). Declared locally to keep this
 * module free of the edges import.
 */
export type ExploreRoute =
  | { type: "overview"; id: "overview" }
  | { type: "list"; id: string; payload: ListRoutePayload }
  | { type: "detail"; id: string; payload: DetailRoutePayload };

/** Resolve a program slug to its administrator utility slug, or null. */
export type ProgramAdminResolver = (programSlug: string) => string | null;

export const DEFAULT_TAB: EntityTab = "utilities";

const DEFAULT_FILTERS: Omit<ListRoutePayload, "tab" | "mode"> = {
  q: "",
  segment: "all",
  type: "all",
  jurisdictions: [],
};

export const DEFAULT_MODE_FOR_TAB: Record<EntityTab, ExploreViewMode> = {
  utilities: "table",
  "grid-operators": "table",
  programs: "table",
  rates: "table",
  "power-plants": "map",
  "transmission-lines": "map",
  "ev-charging": "map",
  "pricing-nodes": "map",
  substations: "map",
};

const VALID_TABS: ReadonlySet<EntityTab> = new Set([
  "utilities",
  "grid-operators",
  "power-plants",
  "programs",
  "rates",
  "transmission-lines",
  "ev-charging",
  "pricing-nodes",
  "substations",
]);

function parseTab(value: string | null): EntityTab {
  if (value && VALID_TABS.has(value as EntityTab)) return value as EntityTab;
  return DEFAULT_TAB;
}

// ---------------------------------------------------------------------------
// Route constructors
// ---------------------------------------------------------------------------

export function makeOverviewRoute(): ExploreRoute {
  return { type: "overview", id: "overview" };
}

export function makeListRoute(
  tab: EntityTab,
  mode?: ExploreViewMode,
  filters: Partial<Omit<ListRoutePayload, "tab" | "mode">> = {}
): ExploreRoute {
  return {
    type: "list",
    id: `list:${tab}`,
    payload: { tab, mode: mode ?? DEFAULT_MODE_FOR_TAB[tab], ...DEFAULT_FILTERS, ...filters },
  };
}

export function makeDetailRoute(entityKind: EntityTab, slug: string): ExploreRoute {
  // Key includes the entity kind so a utility and a program with the same
  // slug string never collide, and so the nested [utility, program] pair has
  // two distinct stack keys.
  return {
    type: "detail",
    id: `detail:${entityKind}:${slug}`,
    payload: { entityKind, slug },
  };
}

// ---------------------------------------------------------------------------
// Stack helpers
// ---------------------------------------------------------------------------

export function findListRoute(routes: ExploreRoute[]): Extract<ExploreRoute, { type: "list" }> | undefined {
  return routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
}

export function detailRoutes(routes: ExploreRoute[]): Extract<ExploreRoute, { type: "detail" }>[] {
  return routes.filter((r): r is Extract<ExploreRoute, { type: "detail" }> => r.type === "detail");
}

/** The top-most detail route, if the stack is currently on a detail. */
export function topDetailRoute(routes: ExploreRoute[]): Extract<ExploreRoute, { type: "detail" }> | undefined {
  for (let i = routes.length - 1; i >= 0; i--) {
    const r = routes[i];
    if (r.type === "detail") return r;
  }
  return undefined;
}

/**
 * Build the detail routes for a program, nested under its administrator
 * utility when one resolves. Returns a 2-route pair
 * `[detail(utility), detail(program)]`, or a single `[detail(program)]` when
 * no administrator utility is resolvable.
 */
export function makeProgramDetailRoutes(
  programSlug: string,
  resolveProgramAdmin?: ProgramAdminResolver
): ExploreRoute[] {
  const adminSlug = resolveProgramAdmin?.(programSlug) ?? null;
  if (adminSlug) {
    return [makeDetailRoute("utilities", adminSlug), makeDetailRoute("programs", programSlug)];
  }
  return [makeDetailRoute("programs", programSlug)];
}

// ---------------------------------------------------------------------------
// URL → stack
// ---------------------------------------------------------------------------

/**
 * Parse URLSearchParams into a stack of explore routes.
 *
 * Grammar:
 * - empty URL                                   → `[overview]`
 * - `?tab=utilities`                            → `[overview, list(utilities)]`
 * - `?tab=plants&slug=sunrise`                  → `[overview, list(plants), detail(sunrise)]`
 * - `?tab=utilities&slug=acme&program=budget`   → nested program under utility
 * - `?tab=programs&slug=budget` (legacy)        → program resolved + nested
 *
 * Filter params (`q`, `segment`, `type`, `jurisdictions`) attach to the
 * current list route's payload.
 */
export function parseRoutes(params: URLSearchParams, resolveProgramAdmin?: ProgramAdminResolver): ExploreRoute[] {
  // Backwards-compat for the old `view` param name.
  const tabParam = params.get("tab") ?? params.get("view");
  if (!tabParam) return [makeOverviewRoute()];

  const tab = parseTab(tabParam);
  const mode = parseViewMode(params.get("mode")) ?? DEFAULT_MODE_FOR_TAB[tab];
  const list = makeListRoute(tab, mode, {
    q: params.get("q") ?? "",
    segment: params.get("segment") ?? "all",
    type: params.get("type") ?? "all",
    jurisdictions: params.get("jurisdictions")?.split(",").filter(Boolean) ?? [],
  });

  const slug = params.get("slug");
  const programParam = params.get("program");

  if (!slug && !programParam) return [makeOverviewRoute(), list];

  // Explicit nested form: `slug` is the administrator utility, `program` is
  // the nested program.
  if (slug && programParam) {
    return [makeOverviewRoute(), list, makeDetailRoute("utilities", slug), makeDetailRoute("programs", programParam)];
  }

  // Program-only slug (legacy global-search link `?tab=programs&slug=<program>`
  // or `?program=<program>`): synthesize the administrator utility beneath it
  // so the back-arrow returns to the utility regardless of entry point.
  const soleProgram = tab === "programs" ? slug : programParam;
  if (soleProgram) {
    return [makeOverviewRoute(), list, ...makeProgramDetailRoutes(soleProgram, resolveProgramAdmin)];
  }

  // Any other single-entity detail: entityKind follows the list tab.
  return [makeOverviewRoute(), list, makeDetailRoute(tab, slug as string)];
}

// ---------------------------------------------------------------------------
// stack → URL
// ---------------------------------------------------------------------------

export function serializeRoutes(routes: ExploreRoute[]): URLSearchParams {
  const params = new URLSearchParams();
  const list = findListRoute(routes);
  const details = detailRoutes(routes);

  if (list) {
    params.set("tab", list.payload.tab);
    if (list.payload.mode !== DEFAULT_MODE_FOR_TAB[list.payload.tab]) {
      params.set("mode", list.payload.mode);
    }
    if (list.payload.q) params.set("q", list.payload.q);
    if (list.payload.segment && list.payload.segment !== "all") params.set("segment", list.payload.segment);
    if (list.payload.type && list.payload.type !== "all") params.set("type", list.payload.type);
    if (list.payload.jurisdictions.length > 0) params.set("jurisdictions", list.payload.jurisdictions.join(","));
  }

  const program = details.find((d) => d.payload.entityKind === "programs");
  const utility = details.find((d) => d.payload.entityKind === "utilities");
  const other = details.find((d) => d.payload.entityKind !== "programs" && d.payload.entityKind !== "utilities");

  if (program && utility) {
    // Nested program under its administrator utility.
    params.set("slug", utility.payload.slug);
    params.set("program", program.payload.slug);
  } else if (program) {
    // Standalone program (no resolvable administrator utility).
    params.set("slug", program.payload.slug);
  } else if (utility) {
    params.set("slug", utility.payload.slug);
  } else if (other) {
    params.set("slug", other.payload.slug);
  }

  return params;
}
