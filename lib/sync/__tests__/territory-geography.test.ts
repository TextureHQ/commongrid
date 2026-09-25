import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { DbTransaction } from "@/lib/mod/apply-contribution";
import { prepareTerritoryGeography, snapshotTerritoryGeography } from "../territory-geography";

const polygon = {
  type: "Polygon" as const,
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};
const dialect = new PgDialect();

describe("territory spatial SQL", () => {
  it("validates and hashes normalized full geometry with bound parameters", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ valid: true, next_hash: "new", previous_hash: "old" }] });
    const result = await prepareTerritoryGeography({ execute } as unknown as DbTransaction, "territory-1", polygon);
    expect(result).toMatchObject({ nextHash: "new", previousHash: "old" });
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("ST_IsValid");
    expect(query.sql).toContain("ST_IsEmpty");
    expect(query.sql).toContain("ST_Normalize");
    expect(query.sql).not.toContain("ST_MakeValid");
    expect(query.sql).not.toContain("ST_Simplify");
    expect(query.params).toEqual([JSON.stringify(polygon), "territory-1"]);
  });

  it.each([{ rows: [] }, { rows: [{ valid: false }] }])(
    "fails closed for invalid validation results",
    async ({ rows }) => {
      const execute = vi.fn().mockResolvedValue({ rows });
      await expect(prepareTerritoryGeography({ execute } as unknown as DbTransaction, "bad", polygon)).rejects.toThrow(
        "Invalid or empty"
      );
    }
  );

  it("copies the stored geometry and binds version/provenance without destructive writes", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    await snapshotTerritoryGeography({ execute } as unknown as DbTransaction, "territory-1", 2, "vt-psd", null);
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("INSERT INTO entity_geometry_versions");
    expect(query.sql).toContain("t.geography");
    expect(query.sql).toContain("JOIN entity_versions");
    expect(query.sql).toContain("DO NOTHING");
    expect(query.params).toEqual([2, "vt-psd", null, 2, "territory-1"]);
  });
});
