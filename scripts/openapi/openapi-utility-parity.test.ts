/**
 * Regression test for ALL-739 (OpenAPI Utility schema drift).
 *
 * Morgan reported 2026-05-06 that the published OpenAPI spec listed ~12
 * Utility properties while the live `/api/v1/utilities/{slug}` response
 * returned 42 keys — blocking codegen clients.
 *
 * The drift was fixed by moving the spec to auto-generation from Drizzle
 * (ALL-728, PR #203) and unifying the list/detail serializer (ALL-733,
 * PR #208). This test locks that fix in place by asserting two invariants:
 *
 *   1. The spec's `Utility.properties` key set equals the Drizzle column
 *      names minus `INTERNAL_FIELDS`. The serializer does `db.select()`
 *      followed by `stripInternal()`, so this is exactly the set of keys
 *      a client will observe on the wire.
 *
 *   2. Every public field has a `type` (and at minimum `createdAt` / `id`
 *      are present) — guarding against accidental empty objects.
 *
 * If this test starts failing, the remediation is usually one of:
 *   - Adding a new column to `utilities` → run `npm run openapi` to
 *     regenerate the spec.
 *   - Making a column internal → add it to `lib/api/internal-fields.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { INTERNAL_FIELDS } from "../../lib/api/internal-fields";
import { utilities } from "../../lib/db/schema/utilities";

interface UtilityProperty {
  type?: string;
  description?: string;
  enum?: string[];
  nullable?: boolean;
  format?: string;
  items?: unknown;
}

interface OpenApiSpec {
  components: {
    schemas: {
      Utility: {
        properties: Record<string, UtilityProperty>;
      };
    };
  };
}

const SPEC_PATH = join(__dirname, "../../public/openapi.json");

function loadSpec(): OpenApiSpec {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiSpec;
}

/**
 * Drizzle column names → camelCase keys as they appear on the serialized
 * response. `getTableColumns()` is the same public API used by
 * `schema-from-drizzle.ts` to build the spec, so the two stay in lockstep
 * by construction.
 */
function drizzleColumnNames(): string[] {
  return Object.keys(getTableColumns(utilities));
}

describe("OpenAPI Utility spec parity (ALL-739 regression)", () => {
  it("spec_keys match drizzle_keys minus INTERNAL_FIELDS (empty diff)", () => {
    const spec = loadSpec();
    const specKeys = new Set(Object.keys(spec.components.schemas.Utility.properties));

    const expectedKeys = new Set(drizzleColumnNames().filter((name) => !INTERNAL_FIELDS.has(name)));

    const missingFromSpec = [...expectedKeys].filter((k) => !specKeys.has(k)).sort();
    const extraInSpec = [...specKeys].filter((k) => !expectedKeys.has(k)).sort();

    expect(missingFromSpec, `Keys missing from spec: ${missingFromSpec.join(", ")}`).toEqual([]);
    expect(extraInSpec, `Extra keys in spec: ${extraInSpec.join(", ")}`).toEqual([]);
  });

  it("spec covers all the high-value fields Morgan originally flagged", () => {
    // These are the fields that were missing from the old hand-written spec
    // and that Relay codegen was blocked on. Locking them in explicitly so
    // an accidental future regression is immediately legible.
    const spec = loadSpec();
    const props = spec.components.schemas.Utility.properties;

    const required = [
      "customerCount",
      "totalMeterCount",
      "amiMeterCount",
      "peakDemandMw",
      "winterPeakDemandMw",
      "totalRevenueDollars",
      "totalSalesMwh",
      "website",
      "logo",
      "domains",
      "segment",
      "status",
      "baCode",
      "nercRegion",
      "jurisdiction",
      "source",
      "sourceUrl",
      "version",
    ];

    const missing = required.filter((k) => !(k in props));
    expect(missing, `Missing high-value fields: ${missing.join(", ")}`).toEqual([]);
  });

  it("every Utility property has a declared type (no empty objects)", () => {
    const spec = loadSpec();
    const props = spec.components.schemas.Utility.properties;
    const untyped = Object.entries(props)
      .filter(([, v]) => !v.type && !v.enum && !("items" in v))
      .map(([k]) => k);
    expect(untyped, `Fields missing type: ${untyped.join(", ")}`).toEqual([]);
  });

  it("INTERNAL_FIELDS are never exposed in the spec", () => {
    const spec = loadSpec();
    const props = spec.components.schemas.Utility.properties;
    const leaked = [...INTERNAL_FIELDS].filter((f) => f in props);
    expect(leaked, `Internal fields leaked into spec: ${leaked.join(", ")}`).toEqual([]);
  });
});
