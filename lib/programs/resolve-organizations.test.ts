/**
 * Tests for program organization resolution.
 *
 * Regression under test: the program panel resolved its administrator utility
 * out of the first 200 utilities alphabetically, so an administrator past that
 * cap (real case: `central-georgia-el-member` on "AC Load Management") rendered
 * as *no utility row at all*. These tests pin the display contract: every
 * organization produces a row, administrators come first, and an unresolvable
 * slug degrades to humanized text instead of vanishing.
 */

import { describe, expect, it } from "vitest";

import {
  administratorOrganizations,
  nonAdministratorOrganizations,
  programOrganizationSlugs,
  resolveProgramOrganizations,
  type UtilityRef,
} from "@/lib/programs/resolve-organizations";
import type { Program } from "@/types/programs";
import { ProgramOrganizationRole } from "@/types/programs";

const ADMIN = ProgramOrganizationRole.ADMINISTRATOR;

function makeProgram(organizations: Program["organizations"]): Program {
  return { organizations } as unknown as Program;
}

const utilitiesBySlug = new Map<string, UtilityRef>([
  ["green-mountain-power", { slug: "green-mountain-power", name: "Green Mountain Power" }],
  [
    "central-georgia-el-member",
    { slug: "central-georgia-el-member", name: "Central Georgia Electric Membership Corporation" },
  ],
]);

describe("programOrganizationSlugs", () => {
  it("returns sorted, de-duplicated slugs", () => {
    const program = makeProgram([
      { entityId: "zeta-utility", role: ADMIN },
      { entityId: "alpha-utility", role: ProgramOrganizationRole.FUNDER },
      { entityId: "zeta-utility", role: ProgramOrganizationRole.IMPLEMENTER },
    ]);

    expect(programOrganizationSlugs(program)).toEqual(["alpha-utility", "zeta-utility"]);
  });

  it("returns an empty array for a missing program", () => {
    expect(programOrganizationSlugs(null)).toEqual([]);
    expect(programOrganizationSlugs(undefined)).toEqual([]);
  });
});

describe("resolveProgramOrganizations", () => {
  it("resolves an administrator to its utility name", () => {
    const program = makeProgram([{ entityId: "green-mountain-power", role: ADMIN }]);

    const [row] = resolveProgramOrganizations(program, utilitiesBySlug);

    expect(row.name).toBe("Green Mountain Power");
    expect(row.resolved).toBe(true);
    expect(row.roleLabel).toBe("Administrator");
    expect(row.entityId).toBe("green-mountain-power");
  });

  it("resolves an administrator that sorts past the old 200-utility cap", () => {
    // The exact reported failure: this slug is not in the first 200 utilities
    // alphabetically, so the old client-side find() returned undefined and the
    // panel rendered no utility.
    const program = makeProgram([{ entityId: "central-georgia-el-member", role: ADMIN }]);

    const [row] = resolveProgramOrganizations(program, utilitiesBySlug);

    expect(row.name).toBe("Central Georgia Electric Membership Corporation");
    expect(row.resolved).toBe(true);
  });

  it("falls back to a humanized slug when the entity is unknown", () => {
    const program = makeProgram([{ entityId: "some-outside-entity", role: ADMIN }]);

    const [row] = resolveProgramOrganizations(program, utilitiesBySlug);

    expect(row.name).toBe("Some Outside Entity");
    expect(row.resolved).toBe(false);
  });

  it("never drops an organization row", () => {
    const program = makeProgram([
      { entityId: "green-mountain-power", role: ADMIN },
      { entityId: "unknown-implementer", role: ProgramOrganizationRole.IMPLEMENTER },
      { entityId: "unknown-regulator", role: ProgramOrganizationRole.REGULATOR },
    ]);

    expect(resolveProgramOrganizations(program, utilitiesBySlug)).toHaveLength(3);
  });

  it("orders administrators ahead of other roles", () => {
    const program = makeProgram([
      { entityId: "a-regulator", role: ProgramOrganizationRole.REGULATOR },
      { entityId: "a-funder", role: ProgramOrganizationRole.FUNDER },
      { entityId: "green-mountain-power", role: ADMIN },
    ]);

    expect(resolveProgramOrganizations(program, utilitiesBySlug).map((o) => o.role)).toEqual([
      ADMIN,
      ProgramOrganizationRole.FUNDER,
      ProgramOrganizationRole.REGULATOR,
    ]);
  });

  it("accepts a plain-object lookup as well as a Map", () => {
    const program = makeProgram([{ entityId: "green-mountain-power", role: ADMIN }]);

    const [row] = resolveProgramOrganizations(program, {
      "green-mountain-power": { slug: "green-mountain-power", name: "Green Mountain Power" },
    });

    expect(row.name).toBe("Green Mountain Power");
    expect(row.resolved).toBe(true);
  });

  it("passes through an unrecognized role rather than hiding the row", () => {
    const program = makeProgram([{ entityId: "green-mountain-power", role: "SPONSOR" as ProgramOrganizationRole }]);

    const [row] = resolveProgramOrganizations(program, utilitiesBySlug);

    expect(row.roleLabel).toBe("SPONSOR");
    expect(row.resolved).toBe(true);
  });

  it("handles programs with no organizations and missing programs", () => {
    expect(resolveProgramOrganizations(makeProgram([]), utilitiesBySlug)).toEqual([]);
    expect(resolveProgramOrganizations(null, utilitiesBySlug)).toEqual([]);
    expect(resolveProgramOrganizations(undefined, utilitiesBySlug)).toEqual([]);
  });
});

describe("administrator partitioning", () => {
  const program = makeProgram([
    { entityId: "green-mountain-power", role: ADMIN },
    { entityId: "central-georgia-el-member", role: ADMIN },
    { entityId: "an-implementer", role: ProgramOrganizationRole.IMPLEMENTER },
  ]);

  it("splits administrators from other roles without losing rows", () => {
    const resolved = resolveProgramOrganizations(program, utilitiesBySlug);
    const admins = administratorOrganizations(resolved);
    const others = nonAdministratorOrganizations(resolved);

    expect(admins).toHaveLength(2);
    expect(others).toHaveLength(1);
    expect(admins.length + others.length).toBe(resolved.length);
  });
});
