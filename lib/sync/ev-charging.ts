/**
 * AFDC EV charging station → SyncRecord mapping.
 *
 * Pure (no I/O) so the mapping is unit-testable without a database or a
 * network fetch. Keeps the sync script focused on fetch/transform/summary.
 */

import type { EntityType } from "@/lib/mod/apply-contribution";
import type { SyncRecord } from "./apply-sync";

export const EV_STATION_ENTITY_TYPE: EntityType = "ev_station";

/** Fields the AFDC sync asserts for every station. */
export interface AfdcStationRecord {
  id: string;
  slug: string;
  stationName: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  evNetwork: string | null;
  evLevel1EvseNum: number;
  evLevel2EvseNum: number;
  evDcFastNum: number;
  evConnectorTypes: string[];
  accessCode: "public" | "private" | "restricted";
  statusCode: "E" | "P" | "T";
  openDate: string | null;
  facilityType: string | null;
  ownerTypeCode: string | null;
  evPricing: string | null;
}

/**
 * Map AFDC station records to sync records.
 *
 * `existingIds` is the set of ev_station ids already in the DB. A record whose
 * id is absent is a *new* station, and a create must supply the NOT NULL
 * columns the schema requires. Updates carry the full field set; applySync
 * diffs against the live row and only writes fields that actually changed.
 */
export function toSyncRecords(
  stations: AfdcStationRecord[],
  existingIds: ReadonlySet<string>,
  asOf: Date | null
): SyncRecord[] {
  return stations.map((s) => {
    const isNew = !existingIds.has(s.id);
    return {
      entityId: s.id,
      slug: s.slug,
      sourceId: "afdc",
      asOf,
      fields: isNew ? toCreateFields(s) : toUpdateFields(s),
    };
  });
}

function toUpdateFields(s: AfdcStationRecord): Record<string, unknown> {
  // AFDC owns every attribute field on ev_stations. applySync will diff each
  // field and skip anything a human most-recently authored.
  return {
    stationName: s.stationName,
    streetAddress: s.streetAddress,
    city: s.city,
    state: s.state,
    zip: s.zip,
    latitude: s.latitude,
    longitude: s.longitude,
    evNetwork: s.evNetwork,
    evLevel1EvseNum: s.evLevel1EvseNum,
    evLevel2EvseNum: s.evLevel2EvseNum,
    evDcFastNum: s.evDcFastNum,
    evConnectorTypes: s.evConnectorTypes,
    accessCode: s.accessCode,
    statusCode: s.statusCode,
    openDate: s.openDate,
    facilityType: s.facilityType,
    ownerTypeCode: s.ownerTypeCode,
    evPricing: s.evPricing,
  };
}

function toCreateFields(s: AfdcStationRecord): Record<string, unknown> {
  return {
    ...toUpdateFields(s),
    source: "AFDC",
    sourceUrl: "https://developer.nlr.gov/api/alt-fuel-stations/v1.json",
  };
}
