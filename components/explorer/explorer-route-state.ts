import type { ExploreRouteDescriptor } from "@texturehq/edges-explore";

export type EntityTab =
  | "utilities"
  | "grid-operators"
  | "power-plants"
  | "programs"
  | "transmission-lines"
  | "ev-charging"
  | "pricing-nodes"
  | "substations";

export type ViewMode = "map" | "table";

export interface ListRoutePayload {
  tab: EntityTab;
  q: string;
  segment: string;
  type: string;
  jurisdictions: string[];
  viewMode: ViewMode;
}

export interface DetailRoutePayload {
  entityKind: EntityTab;
  slug: string;
}

export type ExploreRoute =
  | (ExploreRouteDescriptor & { type: "overview"; id: "overview" })
  | (ExploreRouteDescriptor<ListRoutePayload> & { type: "list"; id: string; payload: ListRoutePayload })
  | (ExploreRouteDescriptor<DetailRoutePayload> & { type: "detail"; id: string; payload: DetailRoutePayload });

export const DEFAULT_TAB: EntityTab = "utilities";
export const DEFAULT_VIEW_MODE: ViewMode = "map";

const DEFAULT_FILTERS: Omit<ListRoutePayload, "tab"> = {
  q: "",
  segment: "all",
  type: "all",
  jurisdictions: [],
  viewMode: DEFAULT_VIEW_MODE,
};

export function makeOverviewRoute(): ExploreRoute {
  return { type: "overview", id: "overview" };
}

export function makeListRoute(tab: EntityTab, filters: Partial<Omit<ListRoutePayload, "tab">> = {}): ExploreRoute {
  return {
    type: "list",
    id: `list:${tab}`,
    payload: { tab, ...DEFAULT_FILTERS, ...filters },
  };
}

export function makeDetailRoute(entityKind: EntityTab, slug: string): ExploreRoute {
  return {
    type: "detail",
    id: `detail:${slug}`,
    payload: { entityKind, slug },
  };
}

const VALID_TABS: ReadonlySet<EntityTab> = new Set([
  "utilities",
  "grid-operators",
  "power-plants",
  "programs",
  "transmission-lines",
  "ev-charging",
  "pricing-nodes",
  "substations",
]);

function parseTab(value: string | null): EntityTab {
  if (value && VALID_TABS.has(value as EntityTab)) return value as EntityTab;
  return DEFAULT_TAB;
}

function parseViewMode(value: string | null): ViewMode {
  return value === "table" ? "table" : "map";
}

export function parseExploreRoutes(params: URLSearchParams): ExploreRoute[] {
  const tabParam = params.get("tab") ?? params.get("view");
  if (!tabParam) return [makeOverviewRoute()];

  const tab = parseTab(tabParam);
  const list = makeListRoute(tab, {
    q: params.get("q") ?? "",
    segment: params.get("segment") ?? "all",
    type: params.get("type") ?? "all",
    jurisdictions: params.get("jurisdictions")?.split(",").filter(Boolean) ?? [],
    viewMode: parseViewMode(params.get("mode")),
  });

  const slug = params.get("slug");
  if (!slug) return [makeOverviewRoute(), list];
  return [makeOverviewRoute(), list, makeDetailRoute(tab, slug)];
}

export function serializeExploreRoutes(routes: ExploreRoute[]): URLSearchParams {
  const params = new URLSearchParams();
  const list = routes.find((r): r is Extract<ExploreRoute, { type: "list" }> => r.type === "list");
  const detail = routes.find((r): r is Extract<ExploreRoute, { type: "detail" }> => r.type === "detail");

  if (list) {
    params.set("tab", list.payload.tab);
    if (list.payload.q) params.set("q", list.payload.q);
    if (list.payload.segment && list.payload.segment !== "all") params.set("segment", list.payload.segment);
    if (list.payload.type && list.payload.type !== "all") params.set("type", list.payload.type);
    if (list.payload.jurisdictions.length > 0) params.set("jurisdictions", list.payload.jurisdictions.join(","));
    if (list.payload.viewMode === "table") params.set("mode", "table");
  }
  if (detail) {
    params.set("slug", detail.payload.slug);
  }
  return params;
}
