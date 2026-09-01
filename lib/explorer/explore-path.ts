/**
 * Path-based routing grammar for the /explore surface (CG-252).
 *
 * The URL *path* encodes navigation state; query params carry view options
 * only (`?mode=table`, `?q=`, and the list filters `?segment=`/`?type=`/
 * `?jurisdictions=`). This is the whole point of the structure: programs have
 * two entry points — reached via a parent utility, or viewed directly — and
 * because the path records which one you used, the back-arrow is a simple
 * path-segment pop instead of guesswork.
 *
 * Grammar (segments after `/explore`):
 *
 *   (none)                                          → overview
 *   :tab                                            → list of :tab
 *   :tab/:slug                                      → a single :tab entity
 *   utilities/:utilitySlug/programs/:programSlug    → a program reached via
 *                                                     its parent utility
 *   programs/:programSlug                           → a program viewed directly
 *
 * These are pure functions with no React / router / DOM dependency so the
 * grammar can be unit-tested in isolation, exactly like `view-mode.ts` and
 * `detail-view-tab.ts`.
 */

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

const VALID_TABS: ReadonlySet<EntityTab> = new Set<EntityTab>([
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

export const EXPLORE_BASE_PATH = "/explore";

/**
 * Normalized, framework-free representation of one entry in the explore
 * navigation stack. `ExplorerContext` maps its richer `ExploreRoute` shape
 * to/from this so the path grammar stays testable without the route stack.
 */
export type ExplorePathItem =
  | { kind: "overview" }
  | { kind: "list"; tab: EntityTab }
  | { kind: "detail"; entityKind: EntityTab; slug: string };

function isEntityTab(value: string | undefined | null): value is EntityTab {
  return value != null && VALID_TABS.has(value as EntityTab);
}

/**
 * Parse the path segments that follow `/explore` into a navigation stack,
 * oldest (overview root) to newest (deepest detail). Unknown or malformed
 * paths collapse to the overview root rather than throwing, so a hand-typed
 * or stale deep link degrades gracefully instead of crashing the surface.
 */
export function parseExplorePath(segments: readonly string[]): ExplorePathItem[] {
  const cleaned = segments.map((s) => decodeURIComponent(s)).filter((s) => s.length > 0);

  if (cleaned.length === 0) return [{ kind: "overview" }];

  const [first, second, third, fourth] = cleaned;

  if (!isEntityTab(first)) return [{ kind: "overview" }];
  const tab = first;

  // /explore/:tab
  if (second == null) {
    return [{ kind: "overview" }, { kind: "list", tab }];
  }

  // /explore/utilities/:utilitySlug/programs/:programSlug — a program reached
  // via its parent utility. Both detail routes are on the stack so the back
  // arrow pops the program and lands on the utility (not the utilities list).
  if (tab === "utilities" && third === "programs" && fourth) {
    return [
      { kind: "overview" },
      { kind: "list", tab: "utilities" },
      { kind: "detail", entityKind: "utilities", slug: second },
      { kind: "detail", entityKind: "programs", slug: fourth },
    ];
  }

  // /explore/:tab/:slug — a single entity of that tab.
  return [{ kind: "overview" }, { kind: "list", tab }, { kind: "detail", entityKind: tab, slug: second }];
}

/**
 * Serialize a navigation stack back to a `/explore` pathname. Inverse of
 * {@link parseExplorePath} for every stack this app can produce.
 *
 * The stack always carries an overview root; only the list and detail routes
 * contribute path segments.
 */
export function serializeExplorePath(items: readonly ExplorePathItem[]): string {
  const list = items.find((i): i is Extract<ExplorePathItem, { kind: "list" }> => i.kind === "list");
  const details = items.filter((i): i is Extract<ExplorePathItem, { kind: "detail" }> => i.kind === "detail");

  if (!list) return EXPLORE_BASE_PATH;

  const encode = (slug: string) => encodeURIComponent(slug);

  // Nested program-under-utility: /explore/utilities/:util/programs/:program
  const utilityDetail = details.find((d) => d.entityKind === "utilities");
  const programDetail = details.find((d) => d.entityKind === "programs");
  if (list.tab === "utilities" && utilityDetail && programDetail) {
    return `${EXPLORE_BASE_PATH}/utilities/${encode(utilityDetail.slug)}/programs/${encode(programDetail.slug)}`;
  }

  // Single detail: /explore/:tab/:slug
  const detail = details[details.length - 1];
  if (detail) {
    return `${EXPLORE_BASE_PATH}/${detail.entityKind}/${encode(detail.slug)}`;
  }

  // List only: /explore/:tab
  return `${EXPLORE_BASE_PATH}/${list.tab}`;
}
