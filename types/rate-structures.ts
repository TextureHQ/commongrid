/**
 * Public RateStructure type — exposed by `/api/v1/rates` and consumed by the
 * Rates & Tariffs explorer panel.
 *
 * This is the curated public shape; it intentionally omits internal
 * governance/audit fields (submittedBy, reviewedBy, reviewedAt, lockedStatus,
 * deletedAt). The API layer strips those explicitly for safety.
 */
export interface RateStructure {
  id: string;
  slug: string;
  name: string;
  eiaId?: number;
  utilityId?: string;
  regionId?: string;
  utilityName?: string;
  sector?: string;
  serviceType?: string;
  description?: string;

  fixedCharge?: string;
  fixedChargeUnits?: string;

  energyRateStructure?: unknown;
  energyWeekdaySchedule?: unknown;
  energyWeekendSchedule?: unknown;
  demandRateStructure?: unknown;
  flatDemandStructure?: unknown;
  demandRateUnit?: string;
  netMeteringRules?: unknown;

  hasTou: boolean;
  hasDemandCharge: boolean;
  hasNetMetering: boolean;
  isEvRate: boolean;

  startDate?: string;
  endDate?: string;
  approved: boolean;
  isDefault: boolean;

  source?: string;
  sourceUrl?: string;
  sourceParentUrl?: string;
  sourceDate?: string;
  /** Link health from the weekly URDB sync: undefined=unchecked, 'ok', 'dead'. */
  sourceUrlStatus?: "ok" | "dead";
  sourceUrlCheckedAt?: string;

  createdAt: string;
  updatedAt: string;
  version: number;
}
