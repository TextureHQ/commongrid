import { describe, expect, it } from "vitest";
import {
  detailRoutes,
  type ExploreRoute,
  makeDetailRoute,
  makeListRoute,
  makeProgramDetailRoutes,
  type ProgramAdminResolver,
  parseRoutes,
  serializeRoutes,
  topDetailRoute,
} from "./explorer-routes";

// A program → administrator-utility resolver stub. "budget-billing" is
// administered by "acme-electric"; "orphan-program" has no administrator.
const resolveAdmin: ProgramAdminResolver = (programSlug) => (programSlug === "budget-billing" ? "acme-electric" : null);

function kinds(routes: ExploreRoute[]): string[] {
  return routes.map((r) => (r.type === "detail" ? `detail:${r.payload.entityKind}:${r.payload.slug}` : r.type));
}

describe("parseRoutes", () => {
  it("maps an empty URL to the overview root", () => {
    expect(kinds(parseRoutes(new URLSearchParams()))).toEqual(["overview"]);
  });

  it("maps ?tab=utilities to [overview, list]", () => {
    expect(kinds(parseRoutes(new URLSearchParams("tab=utilities")))).toEqual(["overview", "list"]);
  });

  it("maps a plain entity slug to a single detail under its list", () => {
    expect(kinds(parseRoutes(new URLSearchParams("tab=power-plants&slug=sunrise")))).toEqual([
      "overview",
      "list",
      "detail:power-plants:sunrise",
    ]);
  });

  it("nests a program under its administrator utility (legacy programs deep link)", () => {
    // Regression CG-252: a global-search program link used to land as a
    // free-standing program detail, so the back-arrow dumped the user on the
    // full utilities list. It must synthesize the administrator utility.
    const routes = parseRoutes(new URLSearchParams("tab=programs&slug=budget-billing"), resolveAdmin);
    expect(kinds(routes)).toEqual([
      "overview",
      "list",
      "detail:utilities:acme-electric",
      "detail:programs:budget-billing",
    ]);
  });

  it("parses the explicit nested ?slug=<utility>&program=<program> form", () => {
    const routes = parseRoutes(
      new URLSearchParams("tab=utilities&slug=acme-electric&program=budget-billing"),
      resolveAdmin
    );
    expect(kinds(routes)).toEqual([
      "overview",
      "list",
      "detail:utilities:acme-electric",
      "detail:programs:budget-billing",
    ]);
  });

  it("degrades to a standalone program when no administrator utility resolves", () => {
    const routes = parseRoutes(new URLSearchParams("tab=programs&slug=orphan-program"), resolveAdmin);
    expect(kinds(routes)).toEqual(["overview", "list", "detail:programs:orphan-program"]);
  });

  it("does not require a resolver (falls back to standalone program)", () => {
    const routes = parseRoutes(new URLSearchParams("tab=programs&slug=budget-billing"));
    expect(kinds(routes)).toEqual(["overview", "list", "detail:programs:budget-billing"]);
  });

  it("honors the legacy ?view= param name", () => {
    expect(kinds(parseRoutes(new URLSearchParams("view=grid-operators")))).toEqual(["overview", "list"]);
  });
});

describe("serializeRoutes", () => {
  it("emits no params for the overview root", () => {
    expect(serializeRoutes([{ type: "overview", id: "overview" }]).toString()).toBe("");
  });

  it("round-trips a plain list route", () => {
    const routes = parseRoutes(new URLSearchParams("tab=power-plants"));
    expect(serializeRoutes(routes).get("tab")).toBe("power-plants");
  });

  it("serializes a nested program as slug=<utility>&program=<program>", () => {
    const routes: ExploreRoute[] = [
      { type: "overview", id: "overview" },
      makeListRoute("utilities"),
      makeDetailRoute("utilities", "acme-electric"),
      makeDetailRoute("programs", "budget-billing"),
    ];
    const params = serializeRoutes(routes);
    expect(params.get("slug")).toBe("acme-electric");
    expect(params.get("program")).toBe("budget-billing");
  });

  it("serializes a standalone program under slug=", () => {
    const routes: ExploreRoute[] = [
      { type: "overview", id: "overview" },
      makeListRoute("programs"),
      makeDetailRoute("programs", "orphan-program"),
    ];
    const params = serializeRoutes(routes);
    expect(params.get("slug")).toBe("orphan-program");
    expect(params.get("program")).toBeNull();
  });

  it("is idempotent across parse → serialize → parse for the nested form", () => {
    const first = parseRoutes(
      new URLSearchParams("tab=utilities&slug=acme-electric&program=budget-billing"),
      resolveAdmin
    );
    const serialized = serializeRoutes(first).toString();
    const second = parseRoutes(new URLSearchParams(serialized), resolveAdmin);
    expect(kinds(second)).toEqual(kinds(first));
  });

  it("is idempotent for a legacy program deep link once nested", () => {
    // parse (legacy) → serialize (nested) → parse must be a fixed point, so
    // the URL→stack effect never ping-pongs (CG-257 guard depends on this).
    const first = parseRoutes(new URLSearchParams("tab=programs&slug=budget-billing"), resolveAdmin);
    const serialized = serializeRoutes(first).toString();
    const second = parseRoutes(new URLSearchParams(serialized), resolveAdmin);
    expect(kinds(second)).toEqual(kinds(first));
  });
});

describe("makeProgramDetailRoutes", () => {
  it("nests under the administrator utility when resolvable", () => {
    expect(kinds(makeProgramDetailRoutes("budget-billing", resolveAdmin))).toEqual([
      "detail:utilities:acme-electric",
      "detail:programs:budget-billing",
    ]);
  });

  it("returns a lone program detail when no administrator resolves", () => {
    expect(kinds(makeProgramDetailRoutes("orphan-program", resolveAdmin))).toEqual(["detail:programs:orphan-program"]);
  });
});

describe("topDetailRoute / detailRoutes", () => {
  it("returns the top-most detail (the program in a nested pair)", () => {
    const routes = parseRoutes(new URLSearchParams("tab=programs&slug=budget-billing"), resolveAdmin);
    expect(topDetailRoute(routes)?.payload).toMatchObject({ entityKind: "programs", slug: "budget-billing" });
  });

  it("collects both detail routes in order", () => {
    const routes = parseRoutes(new URLSearchParams("tab=programs&slug=budget-billing"), resolveAdmin);
    expect(detailRoutes(routes).map((d) => d.payload.entityKind)).toEqual(["utilities", "programs"]);
  });
});
