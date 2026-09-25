import changelogData from "@/data/changelog.json";
import type { Changelog } from "@/types/changelog";

// Entities are read from the DB, not static JSON:
//   - utilities: lib/data/utilities.ts (server) + useUtility* hooks (client)
//   - isos/rtos/balancing-authorities: useIsoList/useRtoList/useBalancingAuthorityList
//   - regions: useRegionList hook (regionById/regionByEiaId lookup maps)
//   - programs: lib/data/programs.ts (server) + useProgramList/useAllPrograms (client)
// These loaders are NOT re-exported here: lib/data.ts is imported by client
// components, and re-exporting DB-backed loaders would pull the Postgres
// client (fs/dns/net/tls) into the client bundle. The ~950 KB regions.json
// and ~500 KB programs.json static imports are gone.

const changelog: Changelog = changelogData as Changelog;

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

export function getChangelog(): Changelog {
  return changelog;
}

// Power plant data is loaded client-side via lib/power-plants.ts
// to avoid bundling the 8.7 MB JSON into pre-rendered pages.
