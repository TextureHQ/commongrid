/**
 * Tests for the organization filter in `loadPrograms` (lib/data/programs.ts).
 *
 * The filter runs *after* normalizeOrganizations(), which is deliberate: the
 * `organizations` JSONB column holds two shapes in practice —
 *
 *   [{ "role": "ADMINISTRATOR", "entityId": "vermont-electric-cooperative" }]
 *   ["vermont-electric-cooperative"]           // legacy seed rows
 *
 * — and callers must be able to filter either one with the same query param.
 * Filtering in SQL against the raw JSONB would only catch the first shape.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface DbRow {
  id: string;
  slug: string;
  name: string;
  organizations: unknown;
  [key: string]: unknown;
}

let rows: DbRow[] = [];

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  programs: new Proxy({}, { get: (_t, prop) => ({ name: String(prop) }) }),
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  ilike: (a: unknown, b: unknown) => ({ op: "ilike", a, b }),
  and: (...conds: unknown[]) => ({ op: "and", conds }),
  isNull: (a: unknown) => ({ op: "isNull", a }),
}));

import { loadPrograms } from "@/lib/data/programs";

function row(slug: string, name: string, organizations: unknown): DbRow {
  return {
    id: `id-${slug}`,
    slug,
    name,
    organizations,
    description: null,
    assetTypes: [],
    marketSegments: [],
    participationModels: [],
    incentiveStructures: [],
    gridServices: [],
    regions: [],
    compensationTiers: [],
    capacityTarget: null,
    maxEnrollments: null,
    programSeason: null,
    launchedAt: null,
    enrollmentOpens: null,
    enrollmentCloses: null,
    endsAt: null,
    status: "ACTIVE",
    programWebsite: null,
    faqUrl: null,
    termsUrl: null,
    contactUrl: null,
    variants: [],
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

const VEC = "vermont-electric-cooperative";

describe("loadPrograms organization filter", () => {
  beforeEach(() => {
    rows = [
      row("byob", "Flexible Load - Bring Your Own Battery", [{ role: "ADMINISTRATOR", entityId: VEC }]),
      row("dynamic-organics", "Dynamic Organics", [{ role: "ADMINISTRATOR", entityId: VEC }]),
      row("legacy-shape", "Legacy Shape", [VEC]),
      row("implementer-only", "Implementer Only", [{ role: "IMPLEMENTER", entityId: VEC }]),
      row("other-utility", "Other Utility Program", [{ role: "ADMINISTRATOR", entityId: "clay-electric-cooperative" }]),
      row("no-orgs", "No Orgs", []),
    ];
  });

  it("returns every program associated with the organization, any role", async () => {
    const result = await loadPrograms({ organization: VEC });

    expect(result.map((p) => p.slug).sort()).toEqual(["byob", "dynamic-organics", "implementer-only", "legacy-shape"]);
  });

  it("matches the legacy bare-slug storage shape", async () => {
    const result = await loadPrograms({ organization: VEC });

    expect(result.map((p) => p.slug)).toContain("legacy-shape");
  });

  it("narrows to a single role when organizationRole is given", async () => {
    const result = await loadPrograms({ organization: VEC, organizationRole: "ADMINISTRATOR" });

    expect(result.map((p) => p.slug).sort()).toEqual(["byob", "dynamic-organics", "legacy-shape"]);
    expect(result.map((p) => p.slug)).not.toContain("implementer-only");
  });

  it("excludes programs belonging to other organizations", async () => {
    const result = await loadPrograms({ organization: VEC });

    expect(result.map((p) => p.slug)).not.toContain("other-utility");
    expect(result.map((p) => p.slug)).not.toContain("no-orgs");
  });

  it("returns an empty list for an organization with no programs", async () => {
    const result = await loadPrograms({ organization: "utility-with-no-programs" });

    expect(result).toEqual([]);
  });

  it("returns everything when no organization filter is supplied", async () => {
    const result = await loadPrograms({});

    expect(result).toHaveLength(6);
  });

  it("does not partial-match a longer slug that contains the filter value", async () => {
    rows.push(row("vec-extended", "VEC Extended", [{ role: "ADMINISTRATOR", entityId: `${VEC}-holdings` }]));

    const result = await loadPrograms({ organization: VEC });

    expect(result.map((p) => p.slug)).not.toContain("vec-extended");
  });
});
