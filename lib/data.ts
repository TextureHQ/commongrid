import basData from "@/data/balancing-authorities.json";
import changelogData from "@/data/changelog.json";
import isosData from "@/data/isos.json";
import programsData from "@/data/programs.json";
import regionsData from "@/data/regions.json";
import rtosData from "@/data/rtos.json";
import type { Changelog } from "@/types/changelog";
import type { BalancingAuthority, Iso, Region, Rto } from "@/types/entities";
import type { Program } from "@/types/programs";

// Utilities data is in a separate module (lib/data-utilities.ts) to avoid
// bundling the 3.1 MB JSON into client bundles. Re-export for backward
// compatibility with server components.
export {
  getAllUtilities,
  getUtilitiesByBalancingAuthority,
  getUtilitiesByGenerationProvider,
  getUtilitiesByIso,
  getUtilitiesByParent,
  getUtilitiesByRto,
  getUtilitiesByTransmissionProvider,
  getUtilityById,
  getUtilityBySlug,
} from "./data-utilities";

const changelog: Changelog = changelogData as Changelog;
const isos: Iso[] = isosData as Iso[];
const rtos: Rto[] = rtosData as Rto[];
const balancingAuthorities: BalancingAuthority[] = basData as BalancingAuthority[];
const regions: Region[] = regionsData as Region[];
const programs: Program[] = programsData as Program[];

export function getAllIsos(): Iso[] {
  return isos;
}

export function getIsoBySlug(slug: string): Iso | undefined {
  return isos.find((iso) => iso.slug === slug);
}

export function getIsoById(id: string): Iso | undefined {
  return isos.find((iso) => iso.id === id);
}

export function getAllRtos(): Rto[] {
  return rtos;
}

export function getRtoBySlug(slug: string): Rto | undefined {
  return rtos.find((rto) => rto.slug === slug);
}

export function getRtoById(id: string): Rto | undefined {
  return rtos.find((rto) => rto.id === id);
}

export function getAllBalancingAuthorities(): BalancingAuthority[] {
  return balancingAuthorities;
}

export function getBalancingAuthorityBySlug(slug: string): BalancingAuthority | undefined {
  return balancingAuthorities.find((ba) => ba.slug === slug);
}

export function getBalancingAuthorityById(id: string): BalancingAuthority | undefined {
  return balancingAuthorities.find((ba) => ba.id === id);
}

export function getRegionById(id: string): Region | undefined {
  return regions.find((r) => r.id === id);
}

export function getRegionByEiaId(eiaId: string): Region | undefined {
  return regions.find((r) => r.eiaId === eiaId);
}

export function getBalancingAuthoritiesByIso(isoId: string): BalancingAuthority[] {
  return balancingAuthorities.filter((ba) => ba.isoId === isoId);
}

export function searchEntities<T extends { name: string; slug: string }>(entities: T[], query: string): T[] {
  const lower = query.toLowerCase();
  return entities.filter((e) => e.name.toLowerCase().includes(lower) || e.slug.toLowerCase().includes(lower));
}

export function sortByName<T extends { name: string }>(entities: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...entities].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name);
    return direction === "asc" ? cmp : -cmp;
  });
}

export function getAllPrograms(): Program[] {
  return programs;
}

export function getProgramBySlug(slug: string): Program | undefined {
  return programs.find((p) => p.slug === slug);
}

export function getChangelog(): Changelog {
  return changelog;
}

// Power plant data is loaded client-side via lib/power-plants.ts
// to avoid bundling the 8.7 MB JSON into pre-rendered pages.
