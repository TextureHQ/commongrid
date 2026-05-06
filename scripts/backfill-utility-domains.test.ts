import { describe, expect, it } from "vitest";
import { domainFromWebsite, mergeDomains } from "./backfill-utility-domains";

describe("domainFromWebsite", () => {
  it("extracts host from a full URL", () => {
    expect(domainFromWebsite("https://www.duke-energy.com/about")).toBe("duke-energy.com");
  });

  it("strips leading www.", () => {
    expect(domainFromWebsite("https://www.example.com")).toBe("example.com");
  });

  it("lowercases the host", () => {
    expect(domainFromWebsite("https://Example.COM/Path")).toBe("example.com");
  });

  it("handles bare domains without scheme", () => {
    expect(domainFromWebsite("example.coop")).toBe("example.coop");
  });

  it("drops port, path, query, and fragment", () => {
    expect(domainFromWebsite("https://example.org:8443/foo?bar=1#baz")).toBe("example.org");
  });

  it("returns null for empty / nullish input", () => {
    expect(domainFromWebsite(null)).toBeNull();
    expect(domainFromWebsite(undefined)).toBeNull();
    expect(domainFromWebsite("")).toBeNull();
    expect(domainFromWebsite("   ")).toBeNull();
  });

  it("returns null for junk without a dot", () => {
    expect(domainFromWebsite("localhost")).toBeNull();
    expect(domainFromWebsite("not a domain")).toBeNull();
  });

  it("returns null for malformed URLs (pre-existing data quality issues)", () => {
    // Scraped data sometimes has "-com" instead of ".com"
    expect(domainFromWebsite("http://www.example-com/path")).toBeNull();
  });
});

describe("mergeDomains", () => {
  it("de-duplicates domains across lists (order preserved by first occurrence)", () => {
    expect(mergeDomains(["a.com", "b.com"], ["b.com", "c.com"])).toEqual(["a.com", "b.com", "c.com"]);
  });

  it("normalizes each entry via domainFromWebsite", () => {
    expect(mergeDomains(["https://A.COM/x"], ["www.a.com"])).toEqual(["a.com"]);
  });

  it("ignores nulls and empty lists", () => {
    expect(mergeDomains(null, undefined, [])).toEqual([]);
    expect(mergeDomains(null, ["a.com"])).toEqual(["a.com"]);
  });

  it("prioritizes the earliest source's ordering", () => {
    // curated first, existing second, website last
    expect(mergeDomains(["curated.com", "shared.com"], ["existing.com", "shared.com"], ["website.com"])).toEqual([
      "curated.com",
      "shared.com",
      "existing.com",
      "website.com",
    ]);
  });

  it("drops invalid entries silently", () => {
    expect(mergeDomains(["valid.com", "", "no-dot", null as unknown as string])).toEqual(["valid.com"]);
  });
});
