/**
 * Resolve a program's organizations into display-ready rows.
 *
 * Regression context: the explorer's program panel used to resolve the
 * administrator utility by fetching the first 200 of 3,133 utilities
 * alphabetically and running a client-side `find()` on the slug. Any
 * administrator past the alphabetical cap resolved to nothing and the panel
 * silently dropped the utility row entirely — reported on "AC Load Management"
 * (administered by `central-georgia-el-member`). The data was always correct;
 * only the client-side lookup was broken.
 *
 * This module is deliberately pure and free of any Drizzle/Postgres imports so
 * client components can use it, and so the display rules (role labels,
 * unresolved-slug fallback, administrator ordering) are unit-testable without
 * a DOM harness.
 */

import { humanizeSlug } from "@/lib/slugify";
import type { Utility } from "@/types/entities";
import type { Program } from "@/types/programs";
import { ProgramOrganizationRole, ProgramOrganizationRoleLabel } from "@/types/programs";

/** The subset of a utility this module needs; matches `?fields=id,slug,name`. */
export type UtilityRef = Pick<Utility, "slug" | "name">;

export interface ResolvedProgramOrganization {
  /** Utility slug (or other entity id) as stored on the program. */
  entityId: string;
  role: string;
  /** Human-readable role, e.g. "Administrator". */
  roleLabel: string;
  /** Display name: the utility's real name, else a humanized slug. */
  name: string;
  /** True when entityId matched a real utility, so the row can link out. */
  resolved: boolean;
}

/** Administrators first, then the remaining roles in enum order. */
const ROLE_ORDER: string[] = [
  ProgramOrganizationRole.ADMINISTRATOR,
  ProgramOrganizationRole.IMPLEMENTER,
  ProgramOrganizationRole.FUNDER,
  ProgramOrganizationRole.REGULATOR,
];

function roleRank(role: string): number {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

/**
 * The distinct entity slugs a program references, sorted and de-duplicated.
 *
 * Feed this to `useUtilityNames()` so the client fetches exactly the utilities
 * it needs instead of paging the full list.
 */
export function programOrganizationSlugs(program: Program | null | undefined): string[] {
  if (!program) return [];
  return [...new Set(program.organizations.map((o) => o.entityId).filter((id): id is string => !!id))].sort();
}

/**
 * Resolve every organization on a program against a slug → utility map.
 *
 * Unresolved slugs still produce a row (with a humanized name and
 * `resolved: false`) so the UI degrades to "Central Georgia El Member" rather
 * than hiding the association. Incomplete is acceptable; invisible is not.
 */
export function resolveProgramOrganizations(
  program: Program | null | undefined,
  utilitiesBySlug: Map<string, UtilityRef> | Record<string, UtilityRef>
): ResolvedProgramOrganization[] {
  if (!program) return [];

  const lookup = (slug: string): UtilityRef | undefined =>
    utilitiesBySlug instanceof Map ? utilitiesBySlug.get(slug) : utilitiesBySlug[slug];

  return program.organizations
    .filter((o) => !!o.entityId)
    .map((o) => {
      const utility = lookup(o.entityId);
      return {
        entityId: o.entityId,
        role: o.role,
        roleLabel: ProgramOrganizationRoleLabel[o.role as ProgramOrganizationRole] ?? o.role,
        name: utility?.name ?? humanizeSlug(o.entityId),
        resolved: !!utility,
      };
    })
    .sort((a, b) => roleRank(a.role) - roleRank(b.role));
}

/** Organizations with the ADMINISTRATOR role — the program's owning utilities. */
export function administratorOrganizations(
  organizations: ResolvedProgramOrganization[]
): ResolvedProgramOrganization[] {
  return organizations.filter((o) => o.role === ProgramOrganizationRole.ADMINISTRATOR);
}

/** Non-administrator organizations (implementer, funder, regulator, unknown). */
export function nonAdministratorOrganizations(
  organizations: ResolvedProgramOrganization[]
): ResolvedProgramOrganization[] {
  return organizations.filter((o) => o.role !== ProgramOrganizationRole.ADMINISTRATOR);
}
