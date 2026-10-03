/**
 * Pricing-node computed records → SyncRecord mapping for the pricing-nodes sync.
 *
 * The pricing-nodes sync is the authoritative writer for machine-derived
 * pricing-node facts. It merges ISO trading hubs, load zones, SUBLAPs/LAPs,
 * and generation nodes derived from EIA-860 power plants. Because it is the
 * primary source for these rows, it owns all the content fields it produces.
 *
 * Human-editable / locked fields (lockedStatus, submittedBy, reviewedAt,
 * reviewedBy) are deliberately excluded — applySync's policy (B) already
 * protects human edits, and this sync never writes those columns.
 *
 * This module is pure (no I/O) so the mapping is unit-testable without a
 * database or a network fetch.
 */

import type { EntityType } from "@/lib/mod/apply-contribution";
import type { SyncRecord } from "./apply-sync";

export const PRICING_NODE_ENTITY_TYPE: EntityType = "pricing_node";

/**
 * Fields the pricing-nodes sync is authoritative for. Only these are written;
 * bookkeeping columns (id/slug/version/createdAt/updatedAt/geography/geometry)
 * are managed by applySync, and human/audit fields are never touched.
 */
export const PRICING_NODE_OWNED_FIELDS = [
  "name",
  "iso",
  "nodeType",
  "latitude",
  "longitude",
  "zone",
  "state",
  "voltageKv",
  "eiaPlantCode",
  "source",
  "sourceUrl",
] as const;

/** The subset of a computed pricing-node record this mapping reads. */
export interface PricingNodeRecord {
  id: string;
  slug: string;
  name: string;
  iso: string;
  nodeType: string;
  latitude: number;
  longitude: number;
  zone: string | null;
  state: string | null;
  voltageKv: number | null;
  eiaPlantCode: string | null;
  source: string;
  sourceUrl?: string | null;
}

/**
 * Map computed pricing-node records to sync records.
 *
 * `existingIds` is the set of pricing_node ids already in the DB. A record
 * whose id is absent is a *new* node, and a create must supply the NOT NULL
 * columns the schema requires. Because every content field the sync owns is
 * a NOT NULL column (or nullable column we still own), new nodes carry the
 * full owned field set. Updates carry the same owned field set, keeping the
 * sync a full-replacement writer for its own data.
 */
export function toSyncRecords(
  records: PricingNodeRecord[],
  existingIds: ReadonlySet<string>,
  asOf: Date | null
): SyncRecord[] {
  return records.map((r) => {
    const isNew = !existingIds.has(r.id);
    return {
      entityId: r.id,
      slug: r.slug,
      sourceId: r.source,
      asOf,
      fields: isNew ? toCreateFields(r) : toUpdateFields(r),
    };
  });
}

function toCreateFields(r: PricingNodeRecord): Record<string, unknown> {
  // A create must satisfy every NOT NULL column on pricing_nodes. All
  // NOT NULL content columns are owned by this sync, so the create carries
  // the full owned field set.
  return toFields(r);
}

function toUpdateFields(r: PricingNodeRecord): Record<string, unknown> {
  // The sync owns every content field, so updates assert the same field set.
  return toFields(r);
}

function toFields(r: PricingNodeRecord): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const field of PRICING_NODE_OWNED_FIELDS) {
    if (field === "sourceUrl") {
      fields[field] = r.sourceUrl ?? null;
    } else {
      fields[field] = r[field as keyof PricingNodeRecord];
    }
  }
  return fields;
}
