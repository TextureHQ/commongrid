import { describe, expect, it } from "vitest";
import {
  MIN_UTILITY_QUERY_LENGTH,
  mergeUtilityOptions,
  parseUtilityOptions,
  shouldSearchUtilities,
  UTILITY_SEARCH_LIMIT,
  UTILITY_SEARCH_URL_TEMPLATE,
  type UtilityOption,
} from "@/lib/utility-search";

describe("UTILITY_SEARCH_URL_TEMPLATE", () => {
  it("includes the placeholder Edges Autocomplete substitutes", () => {
    expect(UTILITY_SEARCH_URL_TEMPLATE).toContain("{q}");
  });

  it("requests only the fields the dropdown renders", () => {
    expect(UTILITY_SEARCH_URL_TEMPLATE).toContain("fields=slug,name");
  });

  it("caps results at the search limit", () => {
    expect(UTILITY_SEARCH_URL_TEMPLATE).toContain(`limit=${UTILITY_SEARCH_LIMIT}`);
  });

  it("keeps a limit within the API's maximum accepted value", () => {
    // The utilities endpoint clamps `limit` to 200; exceeding it would silently
    // return fewer rows than requested.
    expect(UTILITY_SEARCH_LIMIT).toBeLessThanOrEqual(200);
  });

  it("puts search last so an unencoded ampersand cannot swallow other params", () => {
    // Edges interpolates {q} without encoding. A utility name like
    // "Bozrah Light & Power" therefore splits the query string, and anything
    // after `search` would be lost. Ordering protects limit and fields.
    const searchIndex = UTILITY_SEARCH_URL_TEMPLATE.indexOf("search=");
    expect(searchIndex).toBeGreaterThan(UTILITY_SEARCH_URL_TEMPLATE.indexOf("limit="));
    expect(searchIndex).toBeGreaterThan(UTILITY_SEARCH_URL_TEMPLATE.indexOf("fields="));
    expect(UTILITY_SEARCH_URL_TEMPLATE.endsWith("search={q}")).toBe(true);
  });

  it("still sends a usable search term when the typed text contains an ampersand", () => {
    const url = UTILITY_SEARCH_URL_TEMPLATE.replace("{q}", "Bozrah Light & Power");
    const [, queryString] = url.split("?");
    const params = new URLSearchParams(queryString);

    // The term is truncated at the ampersand, but the surviving prefix still
    // substring-matches the intended utility, and the real params are intact.
    expect(params.get("search")?.trim()).toBe("Bozrah Light");
    expect(params.get("limit")).toBe(String(UTILITY_SEARCH_LIMIT));
    expect(params.get("fields")).toBe("slug,name");
  });
});

describe("shouldSearchUtilities", () => {
  it("skips queries shorter than the minimum length", () => {
    expect(shouldSearchUtilities("")).toBe(false);
    expect(shouldSearchUtilities("v")).toBe(false);
  });

  it("skips whitespace-only queries", () => {
    expect(shouldSearchUtilities("   ")).toBe(false);
  });

  it("allows queries at or above the minimum length", () => {
    expect(shouldSearchUtilities("ve")).toBe(true);
    expect(shouldSearchUtilities("vermont")).toBe(true);
    expect("ve".length).toBe(MIN_UTILITY_QUERY_LENGTH);
  });
});

describe("parseUtilityOptions", () => {
  it("maps slug to id and name to label", () => {
    const parsed = parseUtilityOptions({
      data: [{ slug: "vermont-electric-cooperative", name: "Vermont Electric Cooperative" }],
    });

    expect(parsed).toEqual([{ id: "vermont-electric-cooperative", name: "Vermont Electric Cooperative" }]);
  });

  it("parses a real utilities list payload", () => {
    const parsed = parseUtilityOptions({
      data: [
        { slug: "vermont-electric-cooperative", name: "Vermont Electric Cooperative" },
        { slug: "vermont-electric-power-co", name: "Vermont Electric Power Company" },
        { slug: "vermont-electric-trans-co-inc", name: "Vermont Electric Transmission Company" },
      ],
      pagination: { cursor: null, limit: 25, total: 3, hasMore: false },
    });

    expect(parsed).toHaveLength(3);
    expect(parsed.map((option) => option.id)).toContain("vermont-electric-cooperative");
  });

  it("drops records missing a slug or name", () => {
    const parsed = parseUtilityOptions({
      data: [
        { slug: "has-both", name: "Has Both" },
        { slug: "missing-name" },
        { name: "Missing Slug" },
        { slug: "", name: "Empty Slug" },
        { slug: "empty-name", name: "" },
      ],
    });

    expect(parsed).toEqual([{ id: "has-both", name: "Has Both" }]);
  });

  it("returns an empty list for malformed responses instead of throwing", () => {
    expect(parseUtilityOptions(null)).toEqual([]);
    expect(parseUtilityOptions(undefined)).toEqual([]);
    expect(parseUtilityOptions("nope")).toEqual([]);
    expect(parseUtilityOptions({})).toEqual([]);
    expect(parseUtilityOptions({ data: null })).toEqual([]);
    expect(parseUtilityOptions({ data: "nope" })).toEqual([]);
    expect(parseUtilityOptions({ data: [null, 42, "x"] })).toEqual([]);
  });

  it("returns an empty list for an API error envelope", () => {
    expect(parseUtilityOptions({ error: { code: "INTERNAL_ERROR", message: "boom" } })).toEqual([]);
  });
});

describe("mergeUtilityOptions", () => {
  const vermont: UtilityOption = { id: "vermont-electric-cooperative", name: "Vermont Electric Cooperative" };
  const beaches: UtilityOption = { id: "beaches-energy-services", name: "Beaches Energy Services" };

  it("retains previously resolved options so the selected label survives new searches", () => {
    // This is the guard that keeps a chosen utility's name in the input after
    // the user types a different query.
    const merged = mergeUtilityOptions([vermont], [beaches]);

    expect(merged.map((option) => option.id)).toEqual(["vermont-electric-cooperative", "beaches-energy-services"]);
  });

  it("does not duplicate options already present", () => {
    const merged = mergeUtilityOptions([vermont, beaches], [vermont]);
    expect(merged).toHaveLength(2);
  });

  it("preserves array identity when nothing new arrives", () => {
    // Identity stability matters: Autocomplete re-syncs on staticItems changes.
    const existing = [vermont];
    expect(mergeUtilityOptions(existing, [vermont])).toBe(existing);
    expect(mergeUtilityOptions(existing, [])).toBe(existing);
  });

  it("accumulates across several searches", () => {
    const first = mergeUtilityOptions([], parseUtilityOptions({ data: [{ slug: "a", name: "A" }] }));
    const second = mergeUtilityOptions(first, parseUtilityOptions({ data: [{ slug: "b", name: "B" }] }));
    const third = mergeUtilityOptions(second, parseUtilityOptions({ data: [{ slug: "c", name: "C" }] }));

    expect(third.map((option) => option.id)).toEqual(["a", "b", "c"]);
  });
});
