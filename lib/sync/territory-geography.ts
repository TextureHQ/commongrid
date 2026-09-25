import { sql } from "drizzle-orm";
import type { MultiPolygon, Polygon } from "geojson";
import type { DbTransaction } from "@/lib/mod/apply-contribution";

/** Do not simplify or silently repair authoritative boundaries during publication. */
export async function prepareTerritoryGeography(tx: DbTransaction, entityId: string, geometry: Polygon | MultiPolygon) {
  const value = sql`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326))::geography`;
  const result = await tx.execute(sql`
    WITH incoming AS (SELECT ${value} AS geography)
    SELECT ST_IsValid(geography::geometry) AND NOT ST_IsEmpty(geography::geometry) AS valid,
      md5(ST_AsEWKB(ST_Normalize(geography::geometry))) AS next_hash,
      (SELECT md5(ST_AsEWKB(ST_Normalize(geography::geometry)))
         FROM territories WHERE id = ${entityId}) AS previous_hash
    FROM incoming
  `);
  const row = result.rows[0] as { valid: boolean; next_hash: string; previous_hash: string | null } | undefined;
  if (!row?.valid) throw new Error(`Invalid or empty territory polygon: ${entityId}`);
  return { value, nextHash: row.next_hash, previousHash: row.previous_hash };
}

/** Copy the stored polygon, never a JSON approximation, into spatial history. */
export async function snapshotTerritoryGeography(
  tx: DbTransaction,
  entityId: string,
  versionNumber: number,
  sourceId: string | null,
  asOf: Date | null
) {
  await tx.execute(sql`
    INSERT INTO entity_geometry_versions
      (entity_type, entity_id, version_number, geography_snapshot, geometry_type,
       area_sq_km, entity_version_id, source_id, as_of)
    SELECT 'territory', t.id, ${versionNumber}, t.geography,
      ST_GeometryType(t.geography::geometry), ST_Area(t.geography) / 1e6,
      v.id, ${sourceId}, ${asOf}
    FROM territories t
    JOIN entity_versions v ON v.entity_type = 'territory'
      AND v.entity_id = t.id AND v.version_number = ${versionNumber}
    WHERE t.id = ${entityId}
    ON CONFLICT (entity_type, entity_id, version_number) DO NOTHING
  `);
}
