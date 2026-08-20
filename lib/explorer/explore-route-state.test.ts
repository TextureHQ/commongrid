import { describe, expect, it } from "vitest";
import { makeListRoute, parseExploreRoutes, serializeExploreRoutes } from "@/components/explorer/explorer-route-state";

describe("explore route state", () => {
  it("defaults to map mode", () => {
    const routes = parseExploreRoutes(new URLSearchParams("tab=utilities"));
    const list = routes.find((route) => route.type === "list");
    expect(list?.type).toBe("list");
    if (list?.type === "list") {
      expect(list.payload.viewMode).toBe("map");
    }
  });

  it("round-trips table mode in the URL", () => {
    const routes = [makeListRoute("utilities", { viewMode: "table" })];
    expect(serializeExploreRoutes(routes).toString()).toBe("tab=utilities&mode=table");
  });
});
