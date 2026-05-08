/**
 * Regression tests for the Utility schema in the generated OpenAPI spec.
 *
 * Guards against two failure modes:
 *
 *   1. Field drop-off — someone refactors the Drizzle schema or
 *      `scripts/openapi/resources.ts` and the public spec silently loses
 *      fields that external integrators depend on.
 *
 *   2. Spec <-> live API drift — the committed spec documents a shape
 *      the running `/api/v1/utilities/{slug}` handler no longer returns.
 *
 * (1) runs unconditionally. (2) only runs when the environment sets
 *     RUN_LIVE_OPENAPI_PARITY=1 — we don't want CI hitting prod on every
 *     PR, but the check is available locally (and in a nightly job) via:
 *
 *       RUN_LIVE_OPENAPI_PARITY=1 npx vitest run scripts/openapi/openapi-utility-schema.test.ts
 *
 * Origin: the spec went out-of-date after new utility fields landed; we
 * now auto-generate from Drizzle, but want a canary so future regressions
 * fail loud instead of silent.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface Property {
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
        type: string;
        properties: Record<string, Property>;
        required?: string[];
      };
    };
  };
}

const SPEC_PATH = join(__dirname, "../../public/openapi.json");
const LIVE_UTILITY_URL =
  process.env.OPENAPI_PARITY_URL ?? "https://commongrid.info/api/v1/utilities/green-mountain-power";
const RUN_LIVE = process.env.RUN_LIVE_OPENAPI_PARITY === "1";

function loadSpec(): OpenApiSpec {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiSpec;
}

/**
 * Fields that MUST be present in the Utility schema. Losing any of these
 * is a breaking change for public integrators — do not remove entries
 * without a migration plan + changelog note.
 */
const REQUIRED_UTILITY_FIELDS = [
  // Identity
  "id",
  "slug",
  "name",
  "eiaName",
  "shortName",
  // Branding / links
  "logo",
  "website",
  "domains",
  // Regulatory identifiers
  "eiaId",
  "segment",
  "status",
  "jurisdiction",
  // Operational metrics — the primary filter/sort targets for integrators
  "customerCount",
  "peakDemandMw",
  "winterPeakDemandMw",
  "totalRevenueDollars",
  "totalSalesMwh",
  "amiMeterCount",
  "totalMeterCount",
  // Grid-role flags
  "hasGeneration",
  "hasTransmission",
  "hasDistribution",
  // Relationships
  "baCode",
  "nercRegion",
  "isoId",
  "rtoId",
  "balancingAuthorityId",
  "generationProviderId",
  "transmissionProviderId",
  "parentId",
  "successorId",
  "serviceTerritoryId",
  // Provenance
  "source",
  "sourceUrl",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "version",
] as const;

describe("OpenAPI spec — Utility schema coverage", () => {
  it("declares every field partners rely on", () => {
    const spec = loadSpec();
    const props = spec.components.schemas.Utility.properties;

    const missing = REQUIRED_UTILITY_FIELDS.filter((f) => !(f in props));
    expect(missing, `Utility schema is missing fields: ${missing.join(", ")}`).toEqual([]);
  });

  it("has at least REQUIRED_UTILITY_FIELDS worth of properties", () => {
    const spec = loadSpec();
    const props = spec.components.schemas.Utility.properties;
    expect(Object.keys(props).length).toBeGreaterThanOrEqual(REQUIRED_UTILITY_FIELDS.length);
  });

  it("every Utility property declares a type (or $ref)", () => {
    const spec = loadSpec();
    const props = spec.components.schemas.Utility.properties;
    for (const [name, prop] of Object.entries(props)) {
      const hasType = typeof prop.type === "string";
      // biome-ignore lint/suspicious/noExplicitAny: spec may have $ref escape hatch
      const hasRef = typeof (prop as any).$ref === "string";
      expect(hasType || hasRef, `Utility.${name} must declare a type or $ref`).toBe(true);
    }
  });
});

describe.runIf(RUN_LIVE)("OpenAPI spec — live API parity (opt-in)", () => {
  it(`matches the live /api/v1/utilities/{slug} response at ${LIVE_UTILITY_URL}`, async () => {
    const res = await fetch(LIVE_UTILITY_URL);
    expect(res.ok, `live fetch failed: ${res.status}`).toBe(true);
    const payload = (await res.json()) as { data: Record<string, unknown> };
    const liveKeys = new Set(Object.keys(payload.data ?? {}));

    const spec = loadSpec();
    const specKeys = new Set(Object.keys(spec.components.schemas.Utility.properties));

    const missingFromSpec = [...liveKeys].filter((k) => !specKeys.has(k));
    const missingFromLive = [...specKeys].filter((k) => !liveKeys.has(k));

    expect(
      missingFromSpec,
      `Live API returns keys absent from the OpenAPI Utility schema: ${missingFromSpec.join(", ")}`
    ).toEqual([]);
    expect(
      missingFromLive,
      `OpenAPI Utility schema declares keys the live API does not return: ${missingFromLive.join(", ")}`
    ).toEqual([]);
  });
});
