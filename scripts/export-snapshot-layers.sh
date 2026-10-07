#!/usr/bin/env bash
# Additional public snapshot exports. Explicit property projections only: never
# row_to_json a source table, which would leak moderation/user-linked columns.
# Run after the base SQL + point/utility exports in weekly-snapshot.yml.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${SNAPSHOT_DIR:?SNAPSHOT_DIR is required}"

export_layer() {
  local name="$1" query="$2"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -t -A -c "
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(json_agg(json_build_object(
        'type', 'Feature', 'id', q.id,
        'properties', to_jsonb(q) - 'geometry', 'geometry', q.geometry
      ) ORDER BY q.id), '[]'::json)
    ) FROM ($query) q
  " | gzip -9 > "$SNAPSHOT_DIR/$name.geojson.gz"
}

export_layer transmission-lines "
  SELECT id, owner, voltage, volt_class, voltage_class, type, status, sub1, sub2, length_miles, source, source_url, ST_AsGeoJSON(geometry)::json AS geometry FROM transmission_lines WHERE deleted_at IS NULL
"

export_layer substations "
  SELECT id, slug, name, owner_name, owner_utility_id, state, county, min_voltage_kv, max_voltage_kv, substation_type, status, source, source_url, ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326))::json AS geometry FROM substations WHERE deleted_at IS NULL AND longitude BETWEEN -180 AND 180 AND latitude BETWEEN -90 AND 90
"

export_layer territories "
  SELECT t.id, r.id AS region_id, r.slug, r.name, r.type, r.state, t.source, t.source_url, ST_AsGeoJSON(t.geography)::json AS geometry FROM territories t JOIN regions r ON r.id = t.region_id AND r.deleted_at IS NULL WHERE t.deleted_at IS NULL
"

export_layer balancing-authorities "
  SELECT e.id, e.slug, e.name, e.short_name, e.region_id, e.source, e.source_url, t.source AS geometry_source, t.source_url AS geometry_source_url, ST_AsGeoJSON(t.geography)::json AS geometry FROM balancing_authorities e JOIN regions r ON r.id = e.region_id AND r.deleted_at IS NULL JOIN territories t ON t.region_id = r.id AND t.deleted_at IS NULL WHERE e.deleted_at IS NULL
"

export_layer isos "
  SELECT e.id, e.slug, e.name, e.short_name, e.region_id, e.source, e.source_url, t.source AS geometry_source, t.source_url AS geometry_source_url, ST_AsGeoJSON(t.geography)::json AS geometry FROM isos e JOIN regions r ON r.id = e.region_id AND r.deleted_at IS NULL JOIN territories t ON t.region_id = r.id AND t.deleted_at IS NULL WHERE e.deleted_at IS NULL
"

export_layer rtos "
  SELECT e.id, e.slug, e.name, e.short_name, e.region_id, e.source, e.source_url, t.source AS geometry_source, t.source_url AS geometry_source_url, ST_AsGeoJSON(t.geography)::json AS geometry FROM rtos e JOIN regions r ON r.id = e.region_id AND r.deleted_at IS NULL JOIN territories t ON t.region_id = r.id AND t.deleted_at IS NULL WHERE e.deleted_at IS NULL
"

# Rates have relationships, not intrinsic geometry. Preserve source attribution
# and schedules, but exclude raw_record and moderation/user-linked columns.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -t -A -c "
  SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.id), '[]'::json)
  FROM (
    SELECT id, slug, name, eia_id, utility_id, region_id, utility_name,
      sector, service_type, description, fixed_charge, fixed_charge_units,
      energy_rate_structure, energy_weekday_schedule, energy_weekend_schedule,
      demand_rate_structure, flat_demand_structure, demand_rate_unit,
      net_metering_rules, has_tou, has_demand_charge, has_net_metering, is_ev_rate,
      start_date, end_date, approved, is_default, upstream_record_url, attribution,
      source, source_url, source_parent_url, source_date
    FROM rate_structures WHERE deleted_at IS NULL
  ) r
" | gzip -9 > "$SNAPSHOT_DIR/rates.json.gz"
