/**
 * Collect unique territory slugs for one program.
 *
 * The dedupe scope is intentionally per-program: a territory can appear under
 * multiple programs, but should still be included for each one.
 */
export function collectProgramTerritorySlugs(
  regionIds: string[],
  regionById: Map<string, { slug?: string | null } | undefined>
): string[] {
  const territorySlugs: string[] = [];
  const seenTerritories = new Set<string>();

  for (const regionId of regionIds) {
    const region = regionById.get(regionId);
    const slug = region?.slug;
    if (!slug) continue;
    if (seenTerritories.has(slug)) continue;
    territorySlugs.push(slug);
    seenTerritories.add(slug);
  }

  return territorySlugs;
}
