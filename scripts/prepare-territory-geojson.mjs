#!/usr/bin/env node
/**
 * Export the derived retail-exclusive display layer, not as-filed boundaries.
 * See docs/data-sources/retail-territories.md for precedence and limitations.
 * Only session-local temporary tables are written; source records stay intact.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, '.tmp-territories.geojson');
if (existsSync(OUT)) unlinkSync(OUT);
if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set — skipping optional territory layer');
  process.exit(0);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await client.query("SET LOCAL statement_timeout = '10min'");
  await client.query(readFileSync(resolve(__dirname, 'derive-retail-territories.sql'), 'utf8'));
  const { rows: report } = await client.query(readFileSync(resolve(__dirname, 'audit-territory-overlap.sql'), 'utf8'));
  const { rows } = await client.query(`
    SELECT id, slug, name, segment, customer_count, ba_code, state, eia_id,
           territory_id, source, source_url, ST_AsGeoJSON(retail_geom)::json AS geometry
    FROM retail_exclusive WHERE NOT ST_IsEmpty(retail_geom)
    ORDER BY area_m2 DESC, id, territory_id
  `);
  if (!rows.length) throw new Error('No retail territories exported; refusing empty tiles');
  const features = rows.map((r) => ({
    type: 'Feature',
    properties: {
      slug: r.slug, name: r.name, segment: r.segment, eiaId: r.eia_id,
      customerCount: r.customer_count || 0, baCode: r.ba_code, state: r.state,
      territoryId: r.territory_id, source: r.source, sourceUrl: r.source_url,
      derivation: 'retail-exclusive-v1',
    },
    geometry: r.geometry,
  }));
  await client.query('COMMIT');
  writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }));
  writeFileSync(resolve(ROOT, '.tmp-territories-audit.json'), JSON.stringify(report, null, 2));
  console.log(`Exported ${features.length} derived retail territories; audit: .tmp-territories-audit.json`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
