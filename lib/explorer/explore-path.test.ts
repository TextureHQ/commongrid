import { describe, expect, it } from "vitest";
import { EXPLORE_BASE_PATH, type ExplorePathItem, parseExplorePath, serializeExplorePath } from "./explore-path";

describe("parseExplorePath", () => {
  it("empty segments → overview root", () => {
    expect(parseExplorePath([])).toEqual([{ kind: "overview" }]);
  });

  it("blank/slash-only segments collapse to overview", () => {
    expect(parseExplorePath([""])).toEqual([{ kind: "overview" }]);
  });

  it("/:tab → overview + list", () => {
    expect(parseExplorePath(["utilities"])).toEqual([{ kind: "overview" }, { kind: "list", tab: "utilities" }]);
    expect(parseExplorePath(["programs"])).toEqual([{ kind: "overview" }, { kind: "list", tab: "programs" }]);
  });

  it("unknown leading segment degrades to overview", () => {
    expect(parseExplorePath(["not-a-tab"])).toEqual([{ kind: "overview" }]);
    expect(parseExplorePath(["not-a-tab", "whatever"])).toEqual([{ kind: "overview" }]);
  });

  it("/:tab/:slug → overview + list + detail", () => {
    expect(parseExplorePath(["utilities", "vermont-electric-cooperative"])).toEqual([
      { kind: "overview" },
      { kind: "list", tab: "utilities" },
      { kind: "detail", entityKind: "utilities", slug: "vermont-electric-cooperative" },
    ]);
  });

  it("/programs/:slug → program viewed directly", () => {
    expect(parseExplorePath(["programs", "beat-the-peak-37"])).toEqual([
      { kind: "overview" },
      { kind: "list", tab: "programs" },
      { kind: "detail", entityKind: "programs", slug: "beat-the-peak-37" },
    ]);
  });

  it("/utilities/:util/programs/:program → nested program under utility", () => {
    expect(parseExplorePath(["utilities", "vermont-electric-cooperative", "programs", "beat-the-peak-37"])).toEqual([
      { kind: "overview" },
      { kind: "list", tab: "utilities" },
      { kind: "detail", entityKind: "utilities", slug: "vermont-electric-cooperative" },
      { kind: "detail", entityKind: "programs", slug: "beat-the-peak-37" },
    ]);
  });

  it("decodes percent-encoded slugs", () => {
    expect(parseExplorePath(["utilities", "pg%26e"])).toEqual([
      { kind: "overview" },
      { kind: "list", tab: "utilities" },
      { kind: "detail", entityKind: "utilities", slug: "pg&e" },
    ]);
  });
});

describe("serializeExplorePath", () => {
  const overview: ExplorePathItem = { kind: "overview" };

  it("overview only → base path", () => {
    expect(serializeExplorePath([overview])).toBe(EXPLORE_BASE_PATH);
  });

  it("list → /explore/:tab", () => {
    expect(serializeExplorePath([overview, { kind: "list", tab: "programs" }])).toBe("/explore/programs");
  });

  it("single detail → /explore/:tab/:slug", () => {
    expect(
      serializeExplorePath([
        overview,
        { kind: "list", tab: "utilities" },
        { kind: "detail", entityKind: "utilities", slug: "vermont-electric-cooperative" },
      ])
    ).toBe("/explore/utilities/vermont-electric-cooperative");
  });

  it("direct program → /explore/programs/:slug", () => {
    expect(
      serializeExplorePath([
        overview,
        { kind: "list", tab: "programs" },
        { kind: "detail", entityKind: "programs", slug: "beat-the-peak-37" },
      ])
    ).toBe("/explore/programs/beat-the-peak-37");
  });

  it("nested program under utility → deep path", () => {
    expect(
      serializeExplorePath([
        overview,
        { kind: "list", tab: "utilities" },
        { kind: "detail", entityKind: "utilities", slug: "vermont-electric-cooperative" },
        { kind: "detail", entityKind: "programs", slug: "beat-the-peak-37" },
      ])
    ).toBe("/explore/utilities/vermont-electric-cooperative/programs/beat-the-peak-37");
  });

  it("encodes slugs with reserved characters", () => {
    expect(
      serializeExplorePath([
        overview,
        { kind: "list", tab: "utilities" },
        { kind: "detail", entityKind: "utilities", slug: "pg&e" },
      ])
    ).toBe("/explore/utilities/pg%26e");
  });
});

describe("round-trip parse ∘ serialize", () => {
  const cases: string[][] = [
    [],
    ["utilities"],
    ["programs"],
    ["utilities", "vermont-electric-cooperative"],
    ["programs", "beat-the-peak-37"],
    ["utilities", "vermont-electric-cooperative", "programs", "beat-the-peak-37"],
    ["grid-operators", "iso-ne"],
    ["power-plants", "sunrise"],
  ];

  it.each(cases)("segments %j are stable through parse→serialize→parse", (...segments) => {
    const parsed = parseExplorePath(segments);
    const path = serializeExplorePath(parsed);
    const reparsed = parseExplorePath(path.replace(/^\/explore\/?/, "").split("/"));
    expect(reparsed).toEqual(parsed);
  });
});
