/**
 * EIA-861 Demand Response → SyncRecord mapping (CG-289).
 *
 * ⚠️ DATA REALITY — read before extending this file:
 * EIA-861 "Demand Response" is UTILITY-LEVEL AGGREGATE STATISTICS, not a named
 * program catalog. Its natural grain is
 *   (utility_id_eia, state, customer_class, balancing_authority_code, report_year)
 * and its columns are enrolled customer counts, energy savings (MWh), potential
 * and actual peak demand savings (MW), and program costs — split by customer
 * class (Residential / Commercial / Industrial / Transportation / Total). There
 * is NO program name, website, device type, or grid service anywhere in this
 * file.
 *
 * Consequences, enforced here:
 *  - This adapter writes to the `utility` entity type, NOT `program`. It asserts
 *    utility-level DR metrics plus a `hasDemandResponse` existence signal onto
 *    the matching utility row.
 *  - It MUST NOT fabricate program entities and MUST NOT touch co-op program
 *    rows. Named IOU/co-op programs are a separate DSIRE track.
 *  - It only writes to utilities that ALREADY EXIST (matched via the shared
 *    entity resolver). It never creates utilities and never writes a null
 *    parent — unresolved rows are collected and reported by the caller.
 *
 * Pure (no I/O): the caller parses the workbook and builds the resolver
 * lookups; this module maps parsed rows → SyncRecord[] so it is unit-testable
 * with fixtures.
 */

import type { EntityType } from "@/lib/mod/apply-contribution";
import type { SyncRecord } from "./apply-sync";
import { resolveUtilityId, type UtilityLookups } from "./resolve-entity";

export const EIA_861_ENTITY_TYPE: EntityType = "utility";

/**
 * Fields EIA-861 Demand Response is authoritative for. Only these are written;
 * a utility's identity (name, slug, segment, …) comes from the annual EIA-861
 * core / NRECA syncs and human curation, and stays put. Combined with conflict
 * policy (B), a DR run can never clobber a curated name or a hand-fixed metric.
 */
export const EIA_861_OWNED_FIELDS = [
  "hasDemandResponse",
  "drCustomersEnrolled",
  "drPotentialPeakSavingsMw",
  "drActualPeakSavingsMw",
  "drEnergySavingsMwh",
  "drProgramCostUsd",
  "drReportYear",
] as const;

/**
 * One parsed row from the Demand Response sheet, already reduced to the totals
 * the mapping needs. Costs are in THOUSAND dollars in the source file; the
 * parser is responsible for that unit, and this module treats `programCostUsd`
 * as already-in-USD so the mapping stays unit-agnostic and testable.
 */
export interface DemandResponseRow {
  /** EIA utility number (source "Utility Number"). */
  utilityNumber: string;
  utilityName: string;
  state: string | null;
  baCode: string | null;
  reportYear: number;
  /** Per-customer-class values; the mapping aggregates (sums) these. */
  customersEnrolled: number;
  energySavingsMwh: number;
  potentialPeakSavingsMw: number;
  actualPeakSavingsMw: number;
  /** customer incentives + all other costs, already converted to USD. */
  programCostUsd: number;
}

/**
 * A row the resolver could not confidently map to an existing utility. Collected
 * and surfaced by the caller; never written with a null parent.
 */
export interface UnresolvedRow {
  utilityNumber: string;
  utilityName: string;
  state: string | null;
  baCode: string | null;
}

export interface MappingResult {
  records: SyncRecord[];
  unresolved: UnresolvedRow[];
  /** How each resolved record was matched, for run-quality reporting. */
  methodCounts: Record<"eia_id" | "ba_state" | "name_trgm", number>;
}

/**
 * Aggregate DR rows to one record per resolved utility and map to SyncRecords.
 *
 * A single utility can appear on multiple rows (one per state / BA / customer
 * class split), so rows are first summed per resolved utility id, then emitted
 * as one SyncRecord asserting only the EIA_861_OWNED_FIELDS.
 *
 * @param rows            parsed + per-class-aggregated DR rows
 * @param existingUtilityIds ids present in the DB — a resolved id absent here is
 *                        treated as unresolved (we never create utilities)
 * @param lookups         resolver indexes (see buildUtilityLookups)
 */
export function toSyncRecords(
  rows: ReadonlyArray<DemandResponseRow>,
  existingUtilityIds: ReadonlySet<string>,
  lookups: UtilityLookups
): MappingResult {
  const unresolved: UnresolvedRow[] = [];
  const methodCounts = { eia_id: 0, ba_state: 0, name_trgm: 0 };

  // Accumulate per resolved utility id so multi-row utilities sum correctly.
  interface Accum {
    reportYear: number;
    customersEnrolled: number;
    energySavingsMwh: number;
    potentialPeakSavingsMw: number;
    actualPeakSavingsMw: number;
    programCostUsd: number;
  }
  const byUtilityId = new Map<string, Accum>();

  for (const row of rows) {
    const { utilityId, method } = resolveUtilityId(
      { eiaId: row.utilityNumber, baCode: row.baCode, state: row.state, name: row.utilityName },
      lookups
    );

    // Never orphan: unresolved, or resolved to a utility we do not have a row
    // for, is collected and reported — never written with a null parent.
    if (!utilityId || !existingUtilityIds.has(utilityId)) {
      unresolved.push({
        utilityNumber: row.utilityNumber,
        utilityName: row.utilityName,
        state: row.state,
        baCode: row.baCode,
      });
      continue;
    }

    // Count the method only once per utility (on first contributing row).
    // `method` is never "unresolved" here (guarded by the null check above), but
    // narrow explicitly so the indexed increment is type-safe.
    if (!byUtilityId.has(utilityId) && method !== "unresolved") methodCounts[method] += 1;

    const acc = byUtilityId.get(utilityId) ?? {
      reportYear: row.reportYear,
      customersEnrolled: 0,
      energySavingsMwh: 0,
      potentialPeakSavingsMw: 0,
      actualPeakSavingsMw: 0,
      programCostUsd: 0,
    };
    acc.reportYear = Math.max(acc.reportYear, row.reportYear);
    acc.customersEnrolled += row.customersEnrolled;
    acc.energySavingsMwh += row.energySavingsMwh;
    acc.potentialPeakSavingsMw += row.potentialPeakSavingsMw;
    acc.actualPeakSavingsMw += row.actualPeakSavingsMw;
    acc.programCostUsd += row.programCostUsd;
    byUtilityId.set(utilityId, acc);
  }

  const records: SyncRecord[] = [];
  for (const [utilityId, acc] of byUtilityId) {
    records.push({
      entityId: utilityId,
      fields: {
        hasDemandResponse: true,
        drCustomersEnrolled: roundInt(acc.customersEnrolled),
        drPotentialPeakSavingsMw: round3(acc.potentialPeakSavingsMw),
        drActualPeakSavingsMw: round3(acc.actualPeakSavingsMw),
        drEnergySavingsMwh: round3(acc.energySavingsMwh),
        drProgramCostUsd: round2(acc.programCostUsd),
        drReportYear: acc.reportYear,
      },
    });
  }

  // Deterministic order (by utility id) so re-runs and snapshots are stable.
  records.sort((a, b) => a.entityId.localeCompare(b.entityId));

  return { records, unresolved, methodCounts };
}

function roundInt(n: number): number {
  return Math.round(n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
