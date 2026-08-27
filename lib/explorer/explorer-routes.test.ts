import { describe, expect, it } from "vitest";
import {
  type ExploreRoute,
  makeDetailRoute,
  makeListRoute,
  makeOverviewRoute,
  parseRoutes,
  serializeRoutes,
} from "./explorer-routes";

describe("parseRoutes / serializeRoutes round-trips", () => {
  it("preserves a detail with entityKind different from the base list tab", () => {
    const routes: ExploreRoute[] = [
      makeOverviewRoute(),
      makeListRoute("utilities"),
      makeDetailRoute("programs", "mass-save"),
    ];
    const params = serializeRoutes(routes);
    const parsed = parseRoutes(params);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].type).toBe("overview");
    expect(parsed[1].type).toBe("list");
    expect(parsed[1].payload.tab).toBe("utilities");
    expect(parsed[2].type).toBe("detail");
    expect(parsed[2].payload.entityKind).toBe("programs");
    expect(parsed[2].payload.slug).toBe("mass-save");
  });

  it("resolves a same-entity detail to the base list tab, not the default tab", () => {
    // Regression: serializeRoutes omits `kind` when the top detail matches the
    // list tab, and parseTab() never returns null, so `parseTab(kind) ?? tab`
    // silently resolved every kind-less detail to "utilities". Clicking a
    // program from the programs list then opened UtilityDetailPanel
    // ("Utility not found") and the program territory never loaded.
    const routes: ExploreRoute[] = [
      makeOverviewRoute(),
      makeListRoute("programs"),
      makeDetailRoute("programs", "mass-save"),
    ];
    const params = serializeRoutes(routes);
    expect(params.get("kind")).toBeNull();
    const parsed = parseRoutes(params);
    expect(parsed).toHaveLength(3);
    expect(parsed[1].payload.tab).toBe("programs");
    expect(parsed[2].type).toBe("detail");
    expect(parsed[2].payload.entityKind).toBe("programs");
    expect(parsed[2].payload.slug).toBe("mass-save");
  });

  it("resolves a same-entity power-plant detail to the power-plants tab", () => {
    const routes: ExploreRoute[] = [
      makeOverviewRoute(),
      makeListRoute("power-plants", "map"),
      makeDetailRoute("power-plants", "sunrise"),
    ];
    const parsed = parseRoutes(serializeRoutes(routes));
    expect(parsed[2].payload.entityKind).toBe("power-plants");
    expect(parsed[2].payload.slug).toBe("sunrise");
  });

  it("round-trips a chain of cross-entity detail routes", () => {
    const routes: ExploreRoute[] = [
      makeOverviewRoute(),
      makeListRoute("utilities"),
      makeDetailRoute("utilities", "eversource"),
      makeDetailRoute("programs", "mass-save"),
      makeDetailRoute("power-plants", "sunrise"),
    ];
    const params = serializeRoutes(routes);
    const parsed = parseRoutes(params);
    expect(parsed.map((r) => r.type)).toEqual(["overview", "list", "detail", "detail", "detail"]);
    expect(parsed[1].payload.tab).toBe("utilities");
    expect(parsed[2].payload).toEqual({ entityKind: "utilities", slug: "eversource" });
    expect(parsed[3].payload).toEqual({ entityKind: "programs", slug: "mass-save" });
    expect(parsed[4].payload).toEqual({ entityKind: "power-plants", slug: "sunrise" });
  });
});
