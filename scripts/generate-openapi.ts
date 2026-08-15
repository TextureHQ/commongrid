/**
 * scripts/generate-openapi.ts
 *
 * Auto-generate `public/openapi.json` from the Drizzle schema + per-endpoint
 * config. Ensures the public API spec never drifts away from the source of
 * truth (the Drizzle tables + actual route handlers).
 *
 * Usage:
 *   npm run generate:openapi   # regenerate public/openapi.json in place
 *   npm run check:openapi      # exit 1 if the committed spec is stale
 *
 * Intentionally excluded from the spec (auth-required / internal):
 *   - /mod/*, /developer/*, /contributions, /discussions, /follows,
 *     /notifications, /me, /editable-fields, /webhooks, /revalidate,
 *     /health, tile endpoints.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INFO, PARAMETERS, SECURITY, SECURITY_SCHEMES, SERVERS, STATIC_SCHEMAS, TAGS } from "./openapi/base";
import { ENDPOINTS, type EndpointDef, type ParamDef } from "./openapi/endpoints";
import { buildResourceSchemas } from "./openapi/resources";
import type { JsonSchema } from "./openapi/schema-from-drizzle";

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

/** Rate-limit headers attached to every limited `/api/v1` success and 429. */
const RATE_LIMIT_HEADERS: Record<string, JsonSchema> = {
  "X-RateLimit-Limit": {
    schema: { type: "integer" },
    description: "Budget of the window that applied for this response (hourly or burst). Examples: 60, 100, 5000.",
  },
  "X-RateLimit-Remaining": {
    schema: { type: "integer" },
    description: "Requests remaining in that same window.",
  },
  "X-RateLimit-Reset": {
    schema: { type: "integer" },
    description: "Unix timestamp (seconds) when the applied window resets.",
  },
  "X-RateLimit-Tier": {
    schema: { type: "string", enum: ["anonymous", "registered", "bulk", "write"] },
    description: "Rate-limit tier that was applied for this request.",
  },
};

const RETRY_AFTER_HEADER: JsonSchema = {
  schema: { type: "integer" },
  description:
    "Seconds to wait before retrying. Matches X-RateLimit-Reset for the window that returned 429 (burst or hourly).",
};

function buildResponses(ep: EndpointDef): JsonSchema {
  const has404 = ep.has404 ?? ep.path.includes("{");
  const has400 = ep.has400 ?? ep.method === "post";

  const content200 = (() => {
    switch (ep.response.kind) {
      case "list":
        return {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { $ref: `#/components/schemas/${ep.response.itemSchemaRef}` },
            },
            meta: { $ref: "#/components/schemas/PaginatedMeta" },
          },
        };
      case "single":
        return { $ref: `#/components/schemas/${ep.response.schemaRef}` };
      case "singleInData":
        return {
          type: "object",
          properties: {
            data: { $ref: `#/components/schemas/${ep.response.schemaRef}` },
          },
        };
      case "geojson":
        return {
          type: "object",
          properties: {
            data: {
              type: "object",
              description: "GeoJSON Feature or FeatureCollection",
            },
          },
        };
      case "raw":
        return ep.response.schema;
    }
  })();

  const okDescription = (() => {
    switch (ep.response.kind) {
      case "list":
        return "Paginated list response";
      case "geojson":
        return "GeoJSON geometry response";
      default:
        return "Successful response";
    }
  })();

  const responses: Record<string, JsonSchema> = {
    "200": {
      description: okDescription,
      headers: RATE_LIMIT_HEADERS,
      content: {
        "application/json": { schema: content200 },
      },
    },
    "429": {
      description:
        "Hourly or burst rate-limit window exceeded. `Retry-After` and `X-RateLimit-*` describe the window that tripped.",
      headers: {
        ...RATE_LIMIT_HEADERS,
        "Retry-After": RETRY_AFTER_HEADER,
      },
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/RateLimitedError" },
        },
      },
    },
  };

  if (has400) {
    responses["400"] = {
      description: "Request validation failed",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    };
  }

  if (has404) {
    responses["404"] = {
      description: "Resource not found",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    };
  }

  return responses;
}

// ---------------------------------------------------------------------------
// Param builder (handles $ref vs inline)
// ---------------------------------------------------------------------------

function buildParameter(p: ParamDef | JsonSchema): JsonSchema {
  // $ref objects pass straight through.
  if ("$ref" in p) return p as JsonSchema;

  const param = p as ParamDef;
  const out: JsonSchema = {
    name: param.name,
    in: param.in,
    ...(param.description ? { description: param.description } : {}),
    ...(param.required ? { required: param.required } : {}),
    ...(param.example !== undefined ? { example: param.example } : {}),
    schema: param.schema,
  };
  return out;
}

// ---------------------------------------------------------------------------
// Main document builder
// ---------------------------------------------------------------------------

function buildSpec(): JsonSchema {
  const resourceSchemas = buildResourceSchemas();
  const schemas: Record<string, JsonSchema> = {
    // Static schemas come first so resource schemas can $ref them if needed.
    ...STATIC_SCHEMAS,
    ...resourceSchemas,
  };

  const paths: Record<string, JsonSchema> = {};
  for (const ep of ENDPOINTS) {
    const parameters = (ep.parameters ?? []).map((p) => buildParameter(p as ParamDef | JsonSchema));
    const requestBody = ep.requestBody
      ? {
          ...(ep.requestBody.description ? { description: ep.requestBody.description } : {}),
          required: ep.requestBody.required ?? true,
          content: {
            "application/json": {
              schema: ep.requestBody.schema,
              ...(ep.requestBody.example !== undefined ? { example: ep.requestBody.example } : {}),
            },
          },
        }
      : undefined;

    const operation: JsonSchema = {
      operationId: ep.operationId,
      summary: ep.summary,
      ...(ep.description ? { description: ep.description } : {}),
      tags: [ep.tag],
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses: buildResponses(ep),
    };

    // Merge into paths (multiple methods per path supported even though we
    // only use GET today).
    const existing = (paths[ep.path] ?? {}) as Record<string, JsonSchema>;
    existing[ep.method] = operation;
    paths[ep.path] = existing;
  }

  return {
    openapi: "3.1.0",
    info: INFO,
    servers: SERVERS,
    security: SECURITY,
    components: {
      securitySchemes: SECURITY_SCHEMES,
      parameters: PARAMETERS,
      schemas,
    },
    paths,
    tags: TAGS,
  };
}

// ---------------------------------------------------------------------------
// Serialize with stable ordering + trailing newline.
// ---------------------------------------------------------------------------

function serialize(spec: JsonSchema): string {
  // JSON.stringify doesn't produce deterministic output if we've mutated
  // the object — but because we build from registries with deterministic
  // iteration order (object literals preserve insertion order in modern
  // engines), the output IS stable across runs.
  return `${JSON.stringify(spec, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");

  const spec = buildSpec();
  const serialized = serialize(spec);

  const target = join(process.cwd(), "public", "openapi.json");

  if (check) {
    let current = "";
    try {
      current = readFileSync(target, "utf8");
    } catch {
      console.error(`❌ ${target} does not exist — run \`npm run generate:openapi\` to create it.`);
      process.exit(1);
    }

    if (current === serialized) {
      console.log("✅ public/openapi.json is up to date with the Drizzle schema.");
      process.exit(0);
    }

    console.error("❌ public/openapi.json is out of sync with the Drizzle schema.");
    console.error("   Run `npm run generate:openapi` and commit the result.");

    // Surface a short diff stat — we don't pull in a diff library just for
    // this, but size delta is a quick signal.
    const currentBytes = Buffer.byteLength(current, "utf8");
    const newBytes = Buffer.byteLength(serialized, "utf8");
    console.error(`   Committed: ${currentBytes} bytes | Regenerated: ${newBytes} bytes`);

    // Highlight up to 20 lines that differ (first mismatch onward).
    const currentLines = current.split("\n");
    const newLines = serialized.split("\n");
    const limit = 20;
    let shown = 0;
    for (let i = 0; i < Math.max(currentLines.length, newLines.length); i++) {
      if (currentLines[i] !== newLines[i]) {
        if (shown === 0) console.error("   First divergence:");
        console.error(`   - ${JSON.stringify(currentLines[i] ?? "")}`);
        console.error(`   + ${JSON.stringify(newLines[i] ?? "")}`);
        shown++;
        if (shown >= limit) {
          console.error(`   ... (${Math.max(currentLines.length, newLines.length) - i - 1} more lines may differ)`);
          break;
        }
      }
    }

    process.exit(1);
  }

  writeFileSync(target, serialized);
  // Emit a tiny summary for the logs.
  const schemaCount = Object.keys((spec as { components: { schemas: unknown } }).components.schemas as object).length;
  const pathCount = Object.keys((spec as { paths: unknown }).paths as object).length;
  console.log(`✅ Wrote ${target}`);
  console.log(`   ${schemaCount} schemas, ${pathCount} paths.`);
}

main();
