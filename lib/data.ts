import changelogData from "@/data/changelog.json";
import programsData from "@/data/programs.json";
import regionsData from "@/data/regions.json";
import { decorateProgramsMapCategory } from "@/lib/programs/program-category";
import type { Changelog } from "@/types/changelog";
import type { Region } from "@/types/entities";
import type { Program } from "@/types/programs";

// Utilities are read from the DB via lib/data/utilities.ts. That module is
// deliberately NOT re-exported here: lib/data.ts is imported by client
// components (for regions/programs helpers), and re-exporting the DB-backed
// loaders would pull the Postgres client (fs/dns/net/tls) into the client
// bundle. Server code imports { getUtilityBySlug, getUtilityById,
// getUtilityNameMap } directly from "@/lib/data/utilities" instead. The
// ~3.1 MB data/utilities.json static import is gone — utilities come from
// Postgres; client components use the useUtility* SWR hooks.

const changelog: Changelog = changelogData as Changelog;
const regions: Region[] = regionsData as Region[];
const programs: Program[] = decorateProgramsMapCategory(programsData as unknown as Program[]);

export function getRegionById(id: string): Region | undefined {
  return regions.find((r) => r.id === id);
}

export function getRegionByEiaId(eiaId: string): Region | undefined {
  return regions.find((r) => r.eiaId === eiaId);
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
