/**
 * Regression tests for enum emission in the generated OpenAPI spec.
 *
 * Asserts that Utility.segment (and a handful of other enum-backed fields)
 * are emitted with a real `enum` array — not the generic "One of: electric,
 * gas, water" description they had before ALL-734.
 *
 * Origin: Morgan's Relay bug report (2026-05-06), bug #6.
 * See memory/specs/relay-commongrid-bugs-2026-05-06.md in the agent workspace.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface UtilitySchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  nullable?: boolean;
}

interface OpenApiSpec {
  components: {
    schemas: {
      Utility: {
        properties: {
          segment: UtilitySchemaProperty;
          status: UtilitySchemaProperty;
          [k: string]: UtilitySchemaProperty;
        };
      };
    };
  };
}

const SPEC_PATH = join(__dirname, "../../public/openapi.json");

function loadSpec(): OpenApiSpec {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiSpec;
}

describe("OpenAPI spec — enum emission", () => {
  it("emits Utility.segment as a real enum", () => {
    const spec = loadSpec();
    const segment = spec.components.schemas.Utility.properties.segment;

    expect(segment).toBeDefined();
    expect(segment.type).toBe("string");
    expect(Array.isArray(segment.enum)).toBe(true);
    expect(segment.enum?.length).toBeGreaterThanOrEqual(4);

    // The key values that must be present — these are the ones consumers
    // actually filter on and that tripped up Morgan's initial integration.
    expect(segment.enum).toContain("DISTRIBUTION_COOPERATIVE");
    expect(segment.enum).toContain("MUNICIPAL_UTILITY");
    expect(segment.enum).toContain("INVESTOR_OWNED_UTILITY");
    expect(segment.enum).toContain("GENERATION_AND_TRANSMISSION");

    // The old buggy description must not survive.
    expect(segment.description ?? "").not.toMatch(/electric,\s*gas,\s*water/i);
  });

  it("emits Utility.status as a real enum", () => {
    const spec = loadSpec();
    const status = spec.components.schemas.Utility.properties.status;

    expect(status).toBeDefined();
    expect(status.type).toBe("string");
    expect(Array.isArray(status.enum)).toBe(true);
    expect(status.enum).toContain("ACTIVE");
  });

  it("Utility.segment enum values are uppercase snake_case (no surprises)", () => {
    const spec = loadSpec();
    const segment = spec.components.schemas.Utility.properties.segment;
    for (const value of segment.enum ?? []) {
      expect(value).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
});
