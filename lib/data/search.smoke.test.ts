/**
 * DB-backed smoke test for the global /search dispatcher.
 *
 * Regression guard: if `/search?q=tri-state` stops returning Tri-State G&T,
 * this test fires in CI (when a DB URL is provisioned) and blocks the merge.
 * Hyphenated slugs like "tri-state" are a known rough spot for
 * tsvector-only matching, so this exercise keeps the ILIKE fallback honest.
 *
 * Gated on `process.env.DATABASE_URL`. Local runs without a DB skip cleanly.
 * To run locally:
 *
 *   export DATABASE_URL=...   # Neon connection string from 1Password
 *   npm test -- search.smoke
 */

import { describe, expect, it } from "vitest";

import { searchAll } from "./search";

const runIfDb = process.env.DATABASE_URL ? describe : describe.skip;

runIfDb("search — live DB smoke", () => {
  it("finds Tri-State G&T by query 'tri-state'", async () => {
    const { results } = await searchAll("tri-state", { types: ["utilities"], limit: 5 });
    const utilities = results.get("utility") ?? [];
    expect(utilities.length).toBeGreaterThan(0);

    const slugs = utilities.map((u) => u.slug);
    expect(slugs).toContain("tri-state-gandt-assn-inc");
  }, 15_000);

  it("finds at least one utility for 'duke energy'", async () => {
    const { results } = await searchAll("duke energy", { types: ["utilities"], limit: 5 });
    const utilities = results.get("utility") ?? [];
    expect(utilities.length).toBeGreaterThan(0);
    expect(utilities.some((u) => /duke/i.test(u.name))).toBe(true);
  }, 15_000);

  it("finds programs for 'demand response'", async () => {
    const { results } = await searchAll("demand response", { types: ["programs"], limit: 5 });
    const programs = results.get("program") ?? [];
    expect(programs.length).toBeGreaterThan(0);
    expect(programs.some((p) => /demand/i.test(p.name))).toBe(true);
  }, 15_000);

  it("finds PJM in the isos bucket", async () => {
    const { results } = await searchAll("pjm", { types: ["isos"], limit: 5 });
    const isos = results.get("iso") ?? [];
    expect(isos.length).toBeGreaterThan(0);
    expect(isos.some((i) => /pjm/i.test(i.name))).toBe(true);
  }, 15_000);

  it("returns results across multiple buckets for a broad query", async () => {
    const { results, source } = await searchAll("tri-state", { limit: 3 });
    expect(source).toBe("db");

    // At minimum utilities + transmission-lines should hit for 'tri-state'.
    const utilities = results.get("utility") ?? [];
    const transmissionLines = results.get("transmission-line") ?? [];
    expect(utilities.length).toBeGreaterThan(0);
    expect(transmissionLines.length).toBeGreaterThan(0);
  }, 30_000);

  it("respects the per-type limit", async () => {
    const { results } = await searchAll("energy", { types: ["utilities"], limit: 3 });
    const utilities = results.get("utility") ?? [];
    expect(utilities.length).toBeLessThanOrEqual(3);
  }, 15_000);

  it("returns empty for an empty/whitespace query", async () => {
    const { results } = await searchAll("   ", { types: ["utilities"], limit: 3 });
    expect(results.get("utility")).toEqual([]);
  }, 15_000);
});
