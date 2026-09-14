import { AssetType, AssetTypeLabel, type Program } from "@/types/programs";

/**
 * Program map categories are derived from assetTypes so DER programs can be
 * grouped on the map without adding another stored field.
 */
export const PROGRAM_MAP_CATEGORY_PRIORITY: AssetType[] = [
  AssetType.BATTERY,
  AssetType.EV_CHARGER,
  AssetType.THERMOSTAT,
  AssetType.WATER_HEATER,
  AssetType.HVAC,
  AssetType.SOLAR_PV,
  AssetType.POOL_PUMP,
  AssetType.GENERATOR,
  AssetType.IRRIGATION,
  AssetType.COMMERCIAL_LOAD,
  AssetType.INDUSTRIAL_LOAD,
  AssetType.WHOLE_HOME,
  AssetType.NON_DEVICE,
];

export interface ProgramCategoryTotals {
  programCount: number;
  capacityTargetMw: number;
  maxEnrollments: number;
  categoryCounts: Record<AssetType, number>;
}

export function getProgramMapCategory(program: Pick<Program, "assetTypes">): AssetType {
  for (const category of PROGRAM_MAP_CATEGORY_PRIORITY) {
    if (program.assetTypes.includes(category)) return category;
  }
  return AssetType.NON_DEVICE;
}

export function getProgramMapCategoryLabel(category: AssetType): string {
  return AssetTypeLabel[category] ?? category;
}

export function decorateProgramMapCategory(program: Program): Program {
  return {
    ...program,
    mapCategory: program.mapCategory ?? getProgramMapCategory(program),
  };
}

export function decorateProgramsMapCategory(programs: Program[]): Program[] {
  return programs.map(decorateProgramMapCategory);
}

export function summarizePrograms(programs: Program[]): ProgramCategoryTotals {
  const categoryCounts = Object.fromEntries(PROGRAM_MAP_CATEGORY_PRIORITY.map((category) => [category, 0])) as Record<
    AssetType,
    number
  >;

  let capacityTargetMw = 0;
  let maxEnrollments = 0;

  for (const program of programs) {
    const category = program.mapCategory ?? getProgramMapCategory(program);
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    capacityTargetMw += program.capacityTarget ?? 0;
    maxEnrollments += program.maxEnrollments ?? 0;
  }

  return {
    programCount: programs.length,
    capacityTargetMw,
    maxEnrollments,
    categoryCounts,
  };
}
