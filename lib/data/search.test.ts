/**
 * Smoke tests for the global search engine (`lib/data/search.ts`).
 *
 * These tests run without a live database by mocking `@/lib/db/client`
 * and capturing the drizzle `sql` fragments that `searchAll` emits.
 *
 * What we're protecting against (the bugs this guards against):
 *   • Regressing `searchFromDb` back to a stub (all results empty) —
 *     see CommonGrid Bug #3 / ALL-731 (`/search?q=tri-state` returned 0 rows).
 *   • Dropping the ILIKE fallback (tsvector stemming alone misses some
 *     literal substring matches like hyphenated slugs).
 *   • Using `plainto_tsquery` (chokes on punctuation) instead of
 *     `websearch_to_tsquery` for the tsvector branch.
 *   • Forgetting to scope queries to `deleted_at IS NULL`.
 *   • Forgetting to parameterize the user-supplied query value.
 *   • Regressing the entity-type list — `/search` must fan out to all
 *     9 supported entity types.
 */

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedQuery {
  sql: string;
  params: unknown[];
}
const captured: CapturedQuery[] = [];
let failNextExecute = false;

const dialect = new PgDialect();

vi.mock("@/lib/db/client", () => {
  return {
    db: {},
    getDb: () => ({
      execute: async (query: SQL) => {
        if (failNextExecute) {
          throw new Error("simulated DB failure");
        }
        const { sql: renderedSql, params } = dialect.sqlToQuery(query);
        captured.push({ sql: renderedSql, params });
        return { rows: [] };
      },
    }),
  };
});

describe("search", () => {
  beforeEach(() => {
    captured.length = 0;
    failNextExecute = false;
  });

  describe("searchAll", () => {
    it("fans out to all 9 entity types by default", async () => {
      const { searchAll, ALL_ENTITY_TYPES } = await import("@/lib/data/search");
      const result = await searchAll("tri-state");

      expect(ALL_ENTITY_TYPES).toHaveLength(9);
      expect(result.source).toBe("db");
      expect(result.results.size).toBe(9);

      // One SQL statement per entity type.
      expect(captured).toHaveLength(9);
    });

    it("respects the `types` filter (subset of entity types)", async () => {
      const { searchAll } = await import("@/lib/data/search");
      const result = await searchAll("tri-state", {
        types: ["utilities", "programs"],
      });

      expect(result.results.size).toBe(2);
      expect(result.results.has("utility")).toBe(true);
      expect(result.results.has("program")).toBe(true);
      expect(captured).toHaveLength(2);
    });

    it("falls back to all entity types if every supplied type is unknown", async () => {
      const { searchAll } = await import("@/lib/data/search");
      const result = await searchAll("tri-state", {
        types: ["bogus-type", "also-bogus"],
      });

      expect(result.results.size).toBe(9);
    });

    it("degrades gracefully: per-type DB failures return [] (not throw)", async () => {
      failNextExecute = true;
      const { searchAll } = await import("@/lib/data/search");
      const result = await searchAll("tri-state");

      expect(result.results.size).toBe(9);
      for (const rows of result.results.values()) {
        expect(rows).toEqual([]);
      }
    });
  });

  describe("SQL shape", () => {
    it("uses websearch_to_tsquery + ILIKE fallback for tsvector tables", async () => {
      const { searchAll } = await import("@/lib/data/search");
      await searchAll("tri-state", { types: ["utilities"] });

      expect(captured).toHaveLength(1);
      const { sql: sqlText } = captured[0];

      // tsvector branch
      expect(sqlText).toMatch(/websearch_to_tsquery/);
      expect(sqlText).toMatch(/search_vector/);
      // ILIKE fallback
      expect(sqlText).toMatch(/ILIKE/i);
      // Ranking
      expect(sqlText).toMatch(/ts_rank/);
      // Soft-delete scope
      expect(sqlText).toMatch(/deleted_at IS NULL/);
      // Does NOT use plainto_tsquery (which chokes on punctuation)
      expect(sqlText).not.toMatch(/plainto_tsquery/);
    });

    it("uses plain ILIKE for tables without search_vector", async () => {
      const { searchAll } = await import("@/lib/data/search");
      await searchAll("caiso", { types: ["isos"] });

      expect(captured).toHaveLength(1);
      const { sql: sqlText } = captured[0];
      expect(sqlText).toMatch(/ILIKE/i);
      expect(sqlText).not.toMatch(/websearch_to_tsquery/);
      expect(sqlText).not.toMatch(/search_vector/);
      expect(sqlText).toMatch(/deleted_at IS NULL/);
    });

    it("parameterizes user input (no SQL injection via query string)", async () => {
      const { searchAll } = await import("@/lib/data/search");
      const nastyQuery = "tri-state'; DROP TABLE utilities; --";
      await searchAll(nastyQuery, { types: ["utilities"] });

      expect(captured).toHaveLength(1);
      const { sql: sqlText, params } = captured[0];

      // Drizzle renders bound parameters as `$1`, `$2`, … placeholders
      // (not as literal embedded strings).
      expect(sqlText).not.toContain("DROP TABLE");
      expect(sqlText).not.toContain(nastyQuery);
      expect(sqlText).toMatch(/\$\d/);

      // The raw query should appear in the params array instead.
      expect(params).toContain(nastyQuery);
      expect(params).toContain(`%${nastyQuery}%`);
    });

    it("targets the correct table per entity type", async () => {
      const { searchAll } = await import("@/lib/data/search");
      await searchAll("anything");

      const tableNames = captured.map((c) => c.sql);
      expect(tableNames.some((s) => /from\s+utilities/i.test(s))).toBe(true);
      expect(tableNames.some((s) => /from\s+programs/i.test(s))).toBe(true);
      expect(tableNames.some((s) => /from\s+power_plants/i.test(s))).toBe(true);
      expect(tableNames.some((s) => /from\s+ev_stations/i.test(s))).toBe(true);
      expect(tableNames.some((s) => /from\s+pricing_nodes/i.test(s))).toBe(true);
      expect(tableNames.some((s) => /from\s+transmission_lines/i.test(s))).toBe(true);
      expect(tableNames.some((s) => /from\s+isos/i.test(s))).toBe(true);
      expect(tableNames.some((s) => /from\s+rtos/i.test(s))).toBe(true);
      expect(tableNames.some((s) => /from\s+balancing_authorities/i.test(s))).toBe(true);
    });
  });

  describe("ENTITY_CONFIG", () => {
    it("defines a config for every EntityType", async () => {
      const { ALL_ENTITY_TYPES, ENTITY_CONFIG } = await import("@/lib/data/search");
      for (const t of ALL_ENTITY_TYPES) {
        expect(ENTITY_CONFIG[t]).toBeDefined();
        expect(ENTITY_CONFIG[t].table).toBeTruthy();
        expect(ENTITY_CONFIG[t].slugColumn).toBeTruthy();
        expect(ENTITY_CONFIG[t].nameColumn).toBeTruthy();
      }
    });

    it("marks exactly the right tables as tsvector-enabled", async () => {
      const { ENTITY_CONFIG } = await import("@/lib/data/search");
      expect(ENTITY_CONFIG.utility.hasSearchVector).toBe(true);
      expect(ENTITY_CONFIG.program.hasSearchVector).toBe(true);
      expect(ENTITY_CONFIG["power-plant"].hasSearchVector).toBe(true);
      expect(ENTITY_CONFIG["ev-station"].hasSearchVector).toBe(true);

      // Tables without a generated search_vector column.
      expect(ENTITY_CONFIG["pricing-node"].hasSearchVector).toBe(false);
      expect(ENTITY_CONFIG["transmission-line"].hasSearchVector).toBe(false);
      expect(ENTITY_CONFIG.iso.hasSearchVector).toBe(false);
      expect(ENTITY_CONFIG.rto.hasSearchVector).toBe(false);
      expect(ENTITY_CONFIG["balancing-authority"].hasSearchVector).toBe(false);
    });
  });
});
