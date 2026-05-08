/**
 * DB-backed smoke test for commongrid.v_deprecated_utilities (M10).
 *
 * Regression guard for the M10 lifecycle view contract. Downstream CRM
 * consumers poll this view to detect deprecated linkage keys; if the
 * shape drifts (renamed/dropped columns, type changes) this test fires
 * in CI and blocks the merge.
 *
 * Gated on `process.env.DATABASE_URL`. Local runs without a DB skip
 * cleanly. To run locally:
 *
 *   export DATABASE_URL=...   # Neon connection string from 1Password
 *   npm test -- v-deprecated-utilities
 *
 * Spec: TextureHQ/mono specs/relay/commongrid-nisc-matcher.md v1.5, M10.
 */

import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

const runIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Expected column shape. Keys match the view's column names; values are
 * the expected PostgreSQL data_type as reported by information_schema.
 * These ARE the contract — changing them is a breaking change for
 * downstream consumers and must coordinate a version bump.
 */
const EXPECTED_COLUMNS: Record<string, string> = {
  eia_id: "text",
  deprecated_at: "timestamp with time zone",
  successor_eia_id: "text",
  reason: "text",
};

runIfDb("commongrid.v_deprecated_utilities — live DB smoke", () => {
  const sql = neon(process.env.DATABASE_URL!);

  it("exists and exposes the contracted column shape", async () => {
    const rows = (await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'commongrid'
        AND table_name = 'v_deprecated_utilities'
      ORDER BY ordinal_position
    `) as Array<{ column_name: string; data_type: string }>;

    expect(rows.length).toBe(Object.keys(EXPECTED_COLUMNS).length);

    const actual = Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
    expect(actual).toEqual(EXPECTED_COLUMNS);
  }, 15_000);

  it("is selectable (returns 0+ rows; contract is shape, not content)", async () => {
    // Selecting should not throw; the view may legitimately be empty if
    // no utilities have been soft-deleted yet.
    const rows = (await sql`
      SELECT eia_id, deprecated_at, successor_eia_id, reason
      FROM commongrid.v_deprecated_utilities
      LIMIT 5
    `) as Array<unknown>;
    expect(Array.isArray(rows)).toBe(true);
  }, 15_000);

  it("only returns soft-deleted rows (deprecated_at is never NULL)", async () => {
    const rows = (await sql`
      SELECT COUNT(*)::int AS n
      FROM commongrid.v_deprecated_utilities
      WHERE deprecated_at IS NULL
    `) as Array<{ n: number }>;
    expect(rows[0].n).toBe(0);
  }, 15_000);
});
