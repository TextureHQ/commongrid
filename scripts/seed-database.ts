#!/usr/bin/env tsx
/**
 * CommonGrid Database Seed Script
 *
 * Reads all static JSON data files and inserts them into PostgreSQL
 * in dependency order. Idempotent — safe to re-run.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npm run seed
 *
 * Seed order (respects FK dependencies):
 *   regions → isos → rtos → balancing_authorities → utilities →
 *   programs → power_plants → ev_stations → transmission_lines →
 *   pricing_nodes → territories
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import {
  balancingAuthorities,
  entityVersions,
  evStations,
  isos,
  powerPlants,
  pricingNodes,
  programs,
  regions,
  rtos,
  substations,
  transmissionLines,
  utilities,
} from "../lib/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FkWarnings {
  missingBaIds: Set<string>;
  missingIsoIds: Set<string>;
  missingRtoIds: Set<string>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;
const DATA_DIR = path.resolve(__dirname, "..", "data");
const TERRITORY_DIR = path.join(DATA_DIR, "territories");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJson<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

/** Split an array into chunks of `size` */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function elapsed(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

type DrizzleDb = ReturnType<typeof drizzle>;

async function seedRegions(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("regions.json");
  let inserted = 0;

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      type: r.type as string,
      eiaId: (r.eiaId as string) ?? null,
      state: (r.state as string) ?? null,
      customers: (r.customers as number) ?? null,
      source: (r.source as string) ?? null,
      sourceDate: (r.sourceDate as string) ?? null,
    }));

    await db.insert(regions).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedIsos(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("isos.json");
  let inserted = 0;

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      shortName: r.shortName as string,
      logo: (r.logo as string) ?? null,
      website: (r.website as string) ?? null,
      states: (r.states as string[]) ?? [],
      regionId: (r.regionId as string) ?? null,
    }));

    await db.insert(isos).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedRtos(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("rtos.json");
  let inserted = 0;

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      shortName: r.shortName as string,
      logo: (r.logo as string) ?? null,
      website: (r.website as string) ?? null,
      states: (r.states as string[]) ?? [],
      regionId: (r.regionId as string) ?? null,
    }));

    await db.insert(rtos).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedBalancingAuthorities(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("balancing-authorities.json");
  let inserted = 0;

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      shortName: r.shortName as string,
      logo: (r.logo as string) ?? null,
      eiaCode: (r.eiaCode as string) ?? null,
      eiaId: (r.eiaId as string) ?? null,
      website: (r.website as string) ?? null,
      states: (r.states as string[]) ?? [],
      isoId: (r.isoId as string) ?? null,
      regionId: (r.regionId as string) ?? null,
    }));

    await db.insert(balancingAuthorities).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedUtilities(
  db: DrizzleDb,
  validIsoIds: Set<string>,
  validRtoIds: Set<string>,
  validBaIds: Set<string>
): Promise<{ inserted: number; warnings: FkWarnings }> {
  const data = loadJson<Array<Record<string, unknown>>>("utilities.json");
  let inserted = 0;

  const warnings: FkWarnings = {
    missingBaIds: new Set<string>(),
    missingIsoIds: new Set<string>(),
    missingRtoIds: new Set<string>(),
  };

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => {
      // Validate FK references and collect missing IDs
      const baId = r.balancingAuthorityId as string | undefined;
      const isoId = r.isoId as string | undefined;
      const rtoId = r.rtoId as string | undefined;

      const validBaId = baId && validBaIds.has(baId) ? baId : null;
      const validIsoId = isoId && validIsoIds.has(isoId) ? isoId : null;
      const validRtoId = rtoId && validRtoIds.has(rtoId) ? rtoId : null;

      // Track missing references
      if (baId && !validBaId) warnings.missingBaIds.add(baId);
      if (isoId && !validIsoId) warnings.missingIsoIds.add(isoId);
      if (rtoId && !validRtoId) warnings.missingRtoIds.add(rtoId);

      return {
        id: r.id as string,
        slug: r.slug as string,
        name: r.name as string,
        eiaName: (r.eiaName as string) ?? null,
        shortName: (r.shortName as string) ?? null,
        logo: (r.logo as string) ?? null,
        website: (r.website as string) ?? null,
        eiaId: (r.eiaId as string) ?? null,
        segment: r.segment as string,
        status: r.status as string,
        customerCount: (r.customerCount as number) ?? null,
        peakDemandMw: (r.peakDemandMw as number) ?? null,
        winterPeakDemandMw: (r.winterPeakDemandMw as number) ?? null,
        totalRevenueDollars: (r.totalRevenueDollars as number) ?? null,
        totalSalesMwh: (r.totalSalesMwh as number) ?? null,
        baCode: (r.baCode as string) ?? null,
        nercRegion: (r.nercRegion as string) ?? null,
        hasGeneration: (r.hasGeneration as boolean) ?? null,
        hasTransmission: (r.hasTransmission as boolean) ?? null,
        hasDistribution: (r.hasDistribution as boolean) ?? null,
        amiMeterCount: (r.amiMeterCount as number) ?? null,
        totalMeterCount: (r.totalMeterCount as number) ?? null,
        jurisdiction: (r.jurisdiction as string) ?? null,
        isoId: validIsoId,
        rtoId: validRtoId,
        balancingAuthorityId: validBaId,
        generationProviderId: (r.generationProviderId as string) ?? null,
        transmissionProviderId: (r.transmissionProviderId as string) ?? null,
        parentId: (r.parentId as string) ?? null,
        successorId: (r.successorId as string) ?? null,
        serviceTerritoryId: (r.serviceTerritoryId as string) ?? null,
      };
    });

    await db.insert(utilities).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return { inserted, warnings };
}

async function seedPrograms(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("programs.json");
  let inserted = 0;

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      organizations: r.organizations ?? [],
      assetTypes: r.assetTypes ?? [],
      marketSegments: r.marketSegments ?? [],
      participationModels: r.participationModels ?? [],
      incentiveStructures: r.incentiveStructures ?? [],
      gridServices: r.gridServices ?? [],
      regions: r.regions ?? [],
      compensationTiers: r.compensationTiers ?? [],
      capacityTarget: (r.capacityTarget as number) ?? null,
      maxEnrollments: (r.maxEnrollments as number) ?? null,
      programSeason: r.programSeason ?? null,
      launchedAt: (r.launchedAt as string) ?? null,
      enrollmentOpens: (r.enrollmentOpens as string) ?? null,
      enrollmentCloses: (r.enrollmentCloses as string) ?? null,
      endsAt: (r.endsAt as string) ?? null,
      status: r.status as string,
      programWebsite: (r.programWebsite as string) ?? null,
      faqUrl: (r.faqUrl as string) ?? null,
      termsUrl: (r.termsUrl as string) ?? null,
      contactUrl: (r.contactUrl as string) ?? null,
      variants: r.variants ?? [],
    }));

    await db.insert(programs).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedPowerPlants(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("power-plants.json");
  let inserted = 0;

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      plantCode: r.plantCode as string,
      utilityId: (r.utilityId as string) ?? null,
      utilityName: r.utilityName as string,
      balancingAuthorityId: (r.balancingAuthorityId as string) ?? null,
      baCode: (r.baCode as string) ?? null,
      state: r.state as string,
      county: (r.county as string) ?? null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      nercRegion: (r.nercRegion as string) ?? null,
      sector: r.sector as string,
      primaryFuel: (r.primaryFuel as string) ?? null,
      fuelCategory: r.fuelCategory as string,
      technologies: r.technologies ?? [],
      energySources: r.energySources ?? [],
      totalCapacityMw: r.totalCapacityMw as number,
      generatorCount: r.generatorCount as number,
      operatingYear: (r.operatingYear as number) ?? null,
      gridVoltageKv: (r.gridVoltageKv as number) ?? null,
      status: r.status as string,
      proposedCapacityMw: (r.proposedCapacityMw as number) ?? null,
      proposedOnlineYear: (r.proposedOnlineYear as number) ?? null,
    }));

    await db.insert(powerPlants).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedEvStations(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("ev-charging.json");
  let inserted = 0;

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      stationName: r.stationName as string,
      streetAddress: r.streetAddress as string,
      city: r.city as string,
      state: r.state as string,
      zip: r.zip as string,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      evNetwork: (r.evNetwork as string) ?? null,
      evLevel1EvseNum: (r.evLevel1EvseNum as number) ?? 0,
      evLevel2EvseNum: (r.evLevel2EvseNum as number) ?? 0,
      evDcFastNum: (r.evDcFastNum as number) ?? 0,
      evConnectorTypes: r.evConnectorTypes ?? [],
      accessCode: r.accessCode as string,
      statusCode: r.statusCode as string,
      openDate: (r.openDate as string) ?? null,
      facilityType: (r.facilityType as string) ?? null,
      ownerTypeCode: (r.ownerTypeCode as string) ?? null,
      evPricing: (r.evPricing as string) ?? null,
    }));

    await db.insert(evStations).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedTransmissionLines(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("transmission-lines.json");
  let inserted = 0;

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      objectId: r.objectId as number,
      type: r.type as string,
      status: r.status as string,
      owner: r.owner as string,
      voltage: (r.voltage as number) ?? null,
      voltClass: r.voltClass as string,
      voltageClass: r.voltageClass as string,
      sub1: r.sub1 as string,
      sub2: r.sub2 as string,
      lengthMiles: r.lengthMiles as number,
      naicsCode: r.naicsCode as string,
      source: (r.source as string) ?? "HIFLD",
    }));

    await db.insert(transmissionLines).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedPricingNodes(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("pricing-nodes.json");
  let inserted = 0;

  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      iso: r.iso as string,
      nodeType: r.nodeType as string,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      zone: (r.zone as string) ?? null,
      state: (r.state as string) ?? null,
      voltageKv: (r.voltageKv as number) ?? null,
      eiaPlantCode: (r.eiaPlantCode as string) ?? null,
      source: r.source as string,
    }));

    await db.insert(pricingNodes).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedSubstations(db: DrizzleDb): Promise<number> {
  const data = loadJson<Array<Record<string, unknown>>>("substations.json");
  let inserted = 0;

  // US states + DC + territories. The EIA/HIFLD feed includes a small number of
  // cross-border rows (BC, SK, AB, etc.) — filter them out to stay scoped to US.
  const US_STATES = new Set([
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
    "DC",
    "PR",
    "GU",
    "VI",
    "AS",
    "MP",
  ]);

  const usData = data.filter((r) => US_STATES.has(String(r.state ?? "").toUpperCase()));

  for (const batch of chunk(usData, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      ownerName: (r.ownerName as string) ?? null,
      ownerUtilityId: null, // Not reconciled at sync time; future PR wires this up.
      state: String(r.state as string).toUpperCase(),
      county: (r.county as string) ?? null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      minVoltageKv: (r.minVoltageKv as number) ?? null,
      maxVoltageKv: (r.maxVoltageKv as number) ?? null,
      substationType: (r.substationType as string) ?? "unknown",
      status: (r.status as string) ?? "unknown",
      source: (r.source as string) ?? "manual",
      sourceUrl: (r.sourceUrl as string) ?? null,
      eiaId: (r.eiaId as string) ?? null,
      osmId: (r.osmId as string) ?? null,
      hifldLegacyId: (r.hifldLegacyId as string) ?? null,
    }));

    await db.insert(substations).values(rows).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}

async function seedTerritories(db: DrizzleDb): Promise<number> {
  const files = fs.readdirSync(TERRITORY_DIR).filter((f) => f.endsWith(".json"));
  let inserted = 0;
  let invalid = 0;

  for (const batch of chunk(files, BATCH_SIZE)) {
    for (const file of batch) {
      const eiaId = path.basename(file, ".json");
      const filePath = path.join(TERRITORY_DIR, file);
      const raw = fs.readFileSync(filePath, "utf-8");

      let geojson: {
        features: Array<{
          properties: Record<string, unknown>;
          geometry: Record<string, unknown>;
        }>;
      };
      try {
        geojson = JSON.parse(raw);
      } catch {
        console.warn(`  ⚠️  Skipping ${file}: invalid JSON`);
        invalid++;
        continue;
      }

      if (!geojson.features || geojson.features.length === 0) {
        console.warn(`  ⚠️  Skipping ${file}: no features`);
        invalid++;
        continue;
      }

      const feature = geojson.features[0];
      const props = feature.properties;
      const regionId = props.id as string;
      const geojsonStr = JSON.stringify(feature.geometry);

      // Insert using PostGIS: validate, fix, and normalize Polygon → MultiPolygon
      // ST_MakeValid fixes any topological issues
      // ST_Multi normalizes Polygon → MultiPolygon
      try {
        await db.execute(sql`
          INSERT INTO territories (id, region_id, geography, source)
          VALUES (
            ${`territory-${eiaId}`},
            ${regionId},
            ST_Multi(ST_MakeValid(ST_GeomFromGeoJSON(${geojsonStr})))::geography,
            ${"HIFLD ArcGIS"}
          )
          ON CONFLICT (id) DO NOTHING
        `);
        inserted++;
      } catch (err) {
        console.warn(`  ⚠️  Skipping territory ${eiaId}: ${(err as Error).message}`);
        invalid++;
      }
    }

    if (inserted % 500 === 0 && inserted > 0) {
      console.log(`  ... ${inserted}/${files.length} territories inserted`);
    }
  }

  if (invalid > 0) {
    console.log(`  ⚠️  ${invalid} territories skipped due to errors`);
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Version snapshots
// ---------------------------------------------------------------------------

async function createVersionSnapshots(
  db: DrizzleDb,
  entityType: string,
  data: Array<Record<string, unknown>>
): Promise<void> {
  // Build v1 snapshot records for each entity
  for (const batch of chunk(data, BATCH_SIZE)) {
    const rows = batch.map((entity) => ({
      entityType,
      entityId: entity.id as string,
      versionNumber: 1,
      snapshot: entity,
      delta: null,
      changedBy: "seed-script",
      changeType: "create" as const,
      changeSummary: "Initial seed",
    }));

    await db.insert(entityVersions).values(rows).onConflictDoNothing();
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationResult {
  table: string;
  expected: number;
  actual: number;
  pass: boolean;
}

async function validateRowCounts(db: DrizzleDb, expectedCounts: Record<string, number>): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  const tableQueries: Record<string, string> = {
    regions: "SELECT COUNT(*) as count FROM regions",
    isos: "SELECT COUNT(*) as count FROM isos",
    rtos: "SELECT COUNT(*) as count FROM rtos",
    balancing_authorities: "SELECT COUNT(*) as count FROM balancing_authorities",
    utilities: "SELECT COUNT(*) as count FROM utilities",
    programs: "SELECT COUNT(*) as count FROM programs",
    power_plants: "SELECT COUNT(*) as count FROM power_plants",
    ev_stations: "SELECT COUNT(*) as count FROM ev_stations",
    transmission_lines: "SELECT COUNT(*) as count FROM transmission_lines",
    pricing_nodes: "SELECT COUNT(*) as count FROM pricing_nodes",
    territories: "SELECT COUNT(*) as count FROM territories",
  };

  for (const [table, query] of Object.entries(tableQueries)) {
    const result = await db.execute(sql.raw(query));
    const actual = Number(result.rows[0].count);
    const expected = expectedCounts[table] ?? 0;
    results.push({
      table,
      expected,
      actual,
      pass: actual >= expected,
    });
  }

  return results;
}

async function validateReferentialIntegrity(db: DrizzleDb): Promise<void> {
  console.log("\n🔗 Referential integrity checks:");

  // ISOs → regions
  const isosOrphaned = await db.execute(sql`
    SELECT COUNT(*) as count FROM isos
    WHERE region_id IS NOT NULL
    AND region_id NOT IN (SELECT id FROM regions)
  `);
  console.log(`  isos → regions: ${Number(isosOrphaned.rows[0].count)} orphaned`);

  // RTOs → regions
  const rtosOrphaned = await db.execute(sql`
    SELECT COUNT(*) as count FROM rtos
    WHERE region_id IS NOT NULL
    AND region_id NOT IN (SELECT id FROM regions)
  `);
  console.log(`  rtos → regions: ${Number(rtosOrphaned.rows[0].count)} orphaned`);

  // BAs → ISOs
  const basOrphaned = await db.execute(sql`
    SELECT COUNT(*) as count FROM balancing_authorities
    WHERE iso_id IS NOT NULL
    AND iso_id NOT IN (SELECT id FROM isos)
  `);
  console.log(`  balancing_authorities → isos: ${Number(basOrphaned.rows[0].count)} orphaned`);

  // Utilities → ISOs
  const utilIsoOrphaned = await db.execute(sql`
    SELECT COUNT(*) as count FROM utilities
    WHERE iso_id IS NOT NULL
    AND iso_id NOT IN (SELECT id FROM isos)
  `);
  console.log(`  utilities → isos: ${Number(utilIsoOrphaned.rows[0].count)} orphaned`);

  // Power plants → utilities
  const ppOrphaned = await db.execute(sql`
    SELECT COUNT(*) as count FROM power_plants
    WHERE utility_id IS NOT NULL
    AND utility_id NOT IN (SELECT id FROM utilities)
  `);
  console.log(`  power_plants → utilities: ${Number(ppOrphaned.rows[0].count)} orphaned`);

  // Territories → regions
  const terrOrphaned = await db.execute(sql`
    SELECT COUNT(*) as count FROM territories
    WHERE region_id NOT IN (SELECT id FROM regions)
  `);
  console.log(`  territories → regions: ${Number(terrOrphaned.rows[0].count)} orphaned`);
}

async function reportSpatialStats(db: DrizzleDb): Promise<void> {
  console.log("\n🌍 Spatial statistics:");

  // Territory stats
  try {
    const terrStats = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        ROUND(AVG(area_sq_km)::numeric, 1) as avg_area,
        ROUND(MIN(area_sq_km)::numeric, 1) as min_area,
        ROUND(MAX(area_sq_km)::numeric, 1) as max_area,
        SUM(vertex_count) as total_vertices
      FROM territories
    `);
    const ts = terrStats.rows[0];
    console.log(`  Territories: ${ts.total} total, avg area ${ts.avg_area} km², ${ts.total_vertices} total vertices`);
    console.log(`  Area range: ${ts.min_area} – ${ts.max_area} km²`);
  } catch {
    console.log("  Territories: spatial stats unavailable (generated columns may not be populated yet)");
  }

  // Power plant geographic spread
  try {
    const ppStats = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        ROUND(MIN(latitude)::numeric, 2) as min_lat,
        ROUND(MAX(latitude)::numeric, 2) as max_lat,
        ROUND(MIN(longitude)::numeric, 2) as min_lon,
        ROUND(MAX(longitude)::numeric, 2) as max_lon
      FROM power_plants
    `);
    const pp = ppStats.rows[0];
    console.log(
      `  Power plants: ${pp.total} total, lat [${pp.min_lat}, ${pp.max_lat}], lon [${pp.min_lon}, ${pp.max_lon}]`
    );
  } catch {
    console.log("  Power plants: spatial stats unavailable");
  }

  // EV stations geographic spread
  try {
    const evStats = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT state) as states
      FROM ev_stations
    `);
    const ev = evStats.rows[0];
    console.log(`  EV stations: ${ev.total} total across ${ev.states} states`);
  } catch {
    console.log("  EV stations: spatial stats unavailable");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const totalStart = Date.now();

  // 1. Check DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is not set. Exiting.");
    console.error("   Usage: DATABASE_URL=postgres://... npm run seed");
    process.exit(1);
  }

  console.log("🌱 CommonGrid Database Seed Script");
  console.log("===================================\n");

  // 2. Create pooled connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
  const db = drizzle(pool);

  console.log("📡 Connected to database\n");

  // Track expected counts for validation
  const expectedCounts: Record<string, number> = {};

  try {
    // 3. Seed in dependency order

    // --- Regions ---
    let start = Date.now();
    const regionCount = await seedRegions(db);
    expectedCounts.regions = regionCount;
    console.log(`✅ regions: ${regionCount}/${regionCount} seeded (${elapsed(start)})`);

    // --- ISOs ---
    start = Date.now();
    const isoCount = await seedIsos(db);
    expectedCounts.isos = isoCount;
    console.log(`✅ isos: ${isoCount}/${isoCount} seeded (${elapsed(start)})`);

    // --- RTOs ---
    start = Date.now();
    const rtoCount = await seedRtos(db);
    expectedCounts.rtos = rtoCount;
    console.log(`✅ rtos: ${rtoCount}/${rtoCount} seeded (${elapsed(start)})`);

    // --- Balancing Authorities ---
    start = Date.now();
    const baCount = await seedBalancingAuthorities(db);
    expectedCounts.balancing_authorities = baCount;
    console.log(`✅ balancing_authorities: ${baCount}/${baCount} seeded (${elapsed(start)})`);

    // Build valid ID sets for FK validation
    const isoData = loadJson<Array<Record<string, unknown>>>("isos.json");
    const rtoData = loadJson<Array<Record<string, unknown>>>("rtos.json");
    const baData = loadJson<Array<Record<string, unknown>>>("balancing-authorities.json");

    const validIsoIds = new Set(isoData.map((r) => r.id as string));
    const validRtoIds = new Set(rtoData.map((r) => r.id as string));
    const validBaIds = new Set(baData.map((r) => r.id as string));

    // --- Utilities ---
    start = Date.now();
    const utilityResult = await seedUtilities(db, validIsoIds, validRtoIds, validBaIds);
    expectedCounts.utilities = utilityResult.inserted;
    console.log(`✅ utilities: ${utilityResult.inserted}/${utilityResult.inserted} seeded (${elapsed(start)})`);

    // Log FK warnings
    if (utilityResult.warnings.missingBaIds.size > 0) {
      console.log(
        `  ⚠️  ${utilityResult.warnings.missingBaIds.size} utilities reference missing balancing authorities:`
      );
      const missingBas = Array.from(utilityResult.warnings.missingBaIds).sort();
      console.log(`      ${missingBas.join(", ")}`);
    }
    if (utilityResult.warnings.missingIsoIds.size > 0) {
      console.log(`  ⚠️  ${utilityResult.warnings.missingIsoIds.size} utilities reference missing ISOs:`);
      const missingIsos = Array.from(utilityResult.warnings.missingIsoIds).sort();
      console.log(`      ${missingIsos.join(", ")}`);
    }
    if (utilityResult.warnings.missingRtoIds.size > 0) {
      console.log(`  ⚠️  ${utilityResult.warnings.missingRtoIds.size} utilities reference missing RTOs:`);
      const missingRtos = Array.from(utilityResult.warnings.missingRtoIds).sort();
      console.log(`      ${missingRtos.join(", ")}`);
    }

    // --- Programs ---
    start = Date.now();
    const programCount = await seedPrograms(db);
    expectedCounts.programs = programCount;
    console.log(`✅ programs: ${programCount}/${programCount} seeded (${elapsed(start)})`);

    // --- Power Plants ---
    start = Date.now();
    const ppCount = await seedPowerPlants(db);
    expectedCounts.power_plants = ppCount;
    console.log(`✅ power_plants: ${ppCount}/${ppCount} seeded (${elapsed(start)})`);

    // --- EV Stations ---
    start = Date.now();
    const evCount = await seedEvStations(db);
    expectedCounts.ev_stations = evCount;
    console.log(`✅ ev_stations: ${evCount}/${evCount} seeded (${elapsed(start)})`);

    // --- Transmission Lines ---
    start = Date.now();
    const tlCount = await seedTransmissionLines(db);
    expectedCounts.transmission_lines = tlCount;
    console.log(`✅ transmission_lines: ${tlCount}/${tlCount} seeded (${elapsed(start)})`);

    // --- Pricing Nodes ---
    start = Date.now();
    const pnCount = await seedPricingNodes(db);
    expectedCounts.pricing_nodes = pnCount;
    console.log(`✅ pricing_nodes: ${pnCount}/${pnCount} seeded (${elapsed(start)})`);

    // --- Substations ---
    start = Date.now();
    const subCount = await seedSubstations(db);
    expectedCounts.substations = subCount;
    console.log(`✅ substations: ${subCount}/${subCount} seeded (${elapsed(start)})`);

    // --- Territories ---
    start = Date.now();
    console.log("\n🗺️  Seeding territories (PostGIS)...");
    const terrCount = await seedTerritories(db);
    expectedCounts.territories = terrCount;
    console.log(`✅ territories: ${terrCount} seeded (${elapsed(start)})`);

    // 4. Create version snapshots
    console.log("\n📸 Creating v1 version snapshots...");
    start = Date.now();

    const versionSeedPairs: Array<{ type: string; file: string }> = [
      { type: "region", file: "regions.json" },
      { type: "iso", file: "isos.json" },
      { type: "rto", file: "rtos.json" },
      { type: "balancing_authority", file: "balancing-authorities.json" },
      { type: "utility", file: "utilities.json" },
      { type: "program", file: "programs.json" },
      { type: "power_plant", file: "power-plants.json" },
      { type: "ev_station", file: "ev-charging.json" },
      { type: "transmission_line", file: "transmission-lines.json" },
      { type: "pricing_node", file: "pricing-nodes.json" },
    ];

    for (const { type, file } of versionSeedPairs) {
      const data = loadJson<Array<Record<string, unknown>>>(file);
      await createVersionSnapshots(db, type, data);
      console.log(`  📸 ${type}: ${data.length} snapshots`);
    }
    console.log(`  Done (${elapsed(start)})`);

    // 5. Validation
    console.log("\n📊 Validation");
    console.log("─────────────");

    const rowResults = await validateRowCounts(db, expectedCounts);
    let allPass = true;
    for (const r of rowResults) {
      const icon = r.pass ? "✅" : "❌";
      console.log(`  ${icon} ${r.table}: ${r.actual} rows (expected ≥${r.expected})`);
      if (!r.pass) allPass = false;
    }

    await validateReferentialIntegrity(db);
    await reportSpatialStats(db);

    // Summary
    const totalRecords = rowResults.reduce((sum, r) => sum + r.actual, 0);
    console.log("\n===================================");
    console.log(`🌱 Seed complete: ${totalRecords.toLocaleString()} total records across ${rowResults.length} tables`);
    console.log(`⏱️  Total time: ${elapsed(totalStart)}`);

    if (!allPass) {
      console.log("⚠️  Some row count checks did not pass. Review output above.");
      process.exit(1);
    }

    console.log("✅ All validations passed!");
  } catch (err) {
    console.error("\n❌ Seed failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
