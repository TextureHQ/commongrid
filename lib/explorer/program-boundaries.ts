import type { Region } from "@/types/entities";
import type { Program } from "@/types/programs";

export interface ProgramBoundaryEntry {
  programSlug: string;
  programName: string;
  programStatus: string;
  colorKey: string;
  territorySlugs: string[];
}

export interface ProgramBoundaryPrep {
  colorMapping: Record<string, { hex: string }>;
  programEntries: ProgramBoundaryEntry[];
  territorySlugs: string[];
}

/**
 * Build the program boundary inputs without dropping territories that appear
 * in more than one program.
 *
 * Each program keeps its own territory list. Territories are deduplicated only
 * for fetching, so shared regions still render under every program that owns
 * them.
 */
export function collectProgramBoundaryPrep(
  programs: Program[],
  regionById: Map<string, Region>,
  operatorPalette: string[]
): ProgramBoundaryPrep {
  let colorIdx = 0;
  const colorMapping: Record<string, { hex: string }> = {};
  const programEntries: ProgramBoundaryEntry[] = [];
  const territorySlugs = new Set<string>();

  for (const prog of programs) {
    const colorKey = `prog-${prog.slug}`;
    colorMapping[colorKey] = { hex: operatorPalette[colorIdx % operatorPalette.length] };
    colorIdx++;

    const territorySlugsForProgram: string[] = [];
    const seenForProgram = new Set<string>();

    for (const regionId of prog.regions) {
      const region = regionById.get(regionId);
      if (!region?.slug || seenForProgram.has(region.slug)) continue;
      seenForProgram.add(region.slug);
      territorySlugsForProgram.push(region.slug);
      territorySlugs.add(region.slug);
    }

    if (territorySlugsForProgram.length > 0) {
      programEntries.push({
        programSlug: prog.slug,
        programName: prog.name,
        programStatus: prog.status,
        colorKey,
        territorySlugs: territorySlugsForProgram,
      });
    }
  }

  return {
    colorMapping,
    programEntries,
    territorySlugs: [...territorySlugs],
  };
}
