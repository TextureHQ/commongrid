/**
 * Regression tests for enum emission in the generated OpenAPI spec.
 *
 * Asserts that Utility.segment (and a handful of other enum-backed fields)
 * are emitted with a real `enum` array — not the generic "One of: electric,
 * gas, water" description they used to carry. Downstream clients generate
 * typed bindings from the spec; a free-form description forces every
 * integrator to hand-type the allowed values.
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
    // actually filter on and that integrators routinely trip over.
    expect(segment.enum).toContain("DISTRIBUTION_COOPERATIVE");
    expect(segment.enum).toContain("MUNICIPAL_UTILITY");
    expect(segment.enum).toContain("INVESTOR_OWNED_UTILITY");
    expect(segment.enum).toContain("GENERATION_AND_TRANSMISSION");
    expect(segment.enum).toContain("FEDERAL");
    expect(segment.enum).toContain("JOINT_ACTION_AGENCY");

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
    expect(status.enum).toContain("ACQUIRED");
    expect(status.enum).toContain("PENDING");
  });

  it("listUtilities segment/status query params use the same enums as the response schema", () => {
    const spec = loadSpec() as OpenApiSpec & {
      paths: {
        "/utilities": {
          get: {
            parameters: Array<{ name?: string; schema?: { enum?: string[] }; $ref?: string }>;
          };
        };
      };
    };
    const params = spec.paths["/utilities"].get.parameters;
    const segmentParam = params.find((p) => p.name === "segment");
    const statusParam = params.find((p) => p.name === "status");

    expect(segmentParam?.schema?.enum).toEqual(spec.components.schemas.Utility.properties.segment.enum);
    expect(statusParam?.schema?.enum).toEqual(spec.components.schemas.Utility.properties.status.enum);
  });

  it("Utility.segment enum values are uppercase snake_case (no surprises)", () => {
    const spec = loadSpec();
    const segment = spec.components.schemas.Utility.properties.segment;
    for (const value of segment.enum ?? []) {
      expect(value).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
});
