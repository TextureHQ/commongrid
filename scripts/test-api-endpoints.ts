#!/usr/bin/env tsx
/**
 * API Test Harness for CommonGrid
 *
 * Comprehensive validation of all API endpoints against the seeded database.
 *
 * Usage:
 *   npm run test:api
 *   API_BASE_URL=https://commongrid.info npm run test:api
 */

import { getDb } from "../lib/db/client";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const RESPONSE_TIME_TARGET_MS = 500;

// Expected counts from seed
const EXPECTED_COUNTS: Record<string, number> = {
  utilities: 3133,
  isos: 7,
  rtos: 7,
  balancing_authorities: 45,
  regions: 3000,
  power_plants: 15082,
  ev_stations: 85425,
  transmission_lines: 52244,
  pricing_nodes: 4065,
  programs: 607,
  territories: 2920,
};

// ---------------------------------------------------------------------------
// Test Result Tracking
// ---------------------------------------------------------------------------

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];
let currentTestName = "";

// ---------------------------------------------------------------------------
// Colored Console Output
// ---------------------------------------------------------------------------

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function pass(msg: string) {
  console.log(`  ${colors.green}✓${colors.reset} ${msg}`);
}

function fail(msg: string, error?: string) {
  console.log(`  ${colors.red}✗${colors.reset} ${msg}`);
  if (error) {
    console.log(`    ${colors.dim}${error}${colors.reset}`);
  }
}

function info(msg: string) {
  console.log(`${colors.cyan}${msg}${colors.reset}`);
}

function warn(msg: string) {
  console.log(`${colors.yellow}${msg}${colors.reset}`);
}

// ---------------------------------------------------------------------------
// Test Assertion Helpers
// ---------------------------------------------------------------------------

function startTest(name: string) {
  currentTestName = name;
}

async function test(
  name: string,
  fn: () => Promise<void> | void
): Promise<void> {
  startTest(name);
  const startTime = performance.now();
  try {
    await fn();
    const duration = performance.now() - startTime;
    results.push({ name, passed: true, duration });
    pass(name);
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    fail(name, errorMsg);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message ||
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertExists<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || "Expected value to exist");
  }
}

// ---------------------------------------------------------------------------
// API Request Helper
// ---------------------------------------------------------------------------

interface ApiResponse<T = unknown> {
  data: T[];
  pagination: {
    cursor: string | null;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface SingleEntityResponse<T = unknown> {
  data: T;
}

async function apiRequest<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<{ response: Response; data: ApiResponse<T>; duration: number }> {
  const url = `${API_BASE_URL}${path}`;
  const startTime = performance.now();
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const duration = performance.now() - startTime;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${response.statusText} (${url})`
    );
  }

  const data = await response.json();
  return { response, data, duration };
}

async function apiRequestSingle<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<{ response: Response; data: T; duration: number }> {
  const url = `${API_BASE_URL}${path}`;
  const startTime = performance.now();
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const duration = performance.now() - startTime;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${response.statusText} (${url})`
    );
  }

  const json = await response.json();
  return { response, data: json.data, duration };
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

function validatePaginatedResponse<T>(
  response: ApiResponse<T>,
  expectedMinCount?: number
) {
  assertExists(response.data, "Response should have data array");
  assert(Array.isArray(response.data), "data should be an array");
  assertExists(response.pagination, "Response should have pagination object");

  const { pagination } = response;
  assert(typeof pagination.limit === "number", "pagination.limit should be a number");
  assert(typeof pagination.total === "number", "pagination.total should be a number");
  assert(typeof pagination.hasMore === "boolean", "pagination.hasMore should be a boolean");
  assert(
    pagination.cursor === null || typeof pagination.cursor === "string",
    "pagination.cursor should be null or string"
  );

  if (expectedMinCount !== undefined) {
    assert(
      pagination.total >= expectedMinCount,
      `Expected total >= ${expectedMinCount}, got ${pagination.total}`
    );
  }
}

function validateResponseTime(duration: number, target = RESPONSE_TIME_TARGET_MS) {
  if (duration > target) {
    warn(`  Response time ${duration.toFixed(0)}ms exceeds target ${target}ms`);
  }
}

function validateRequiredFields(item: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    assertExists(
      item[field],
      `Required field "${field}" is missing or null`
    );
  }
}

// ---------------------------------------------------------------------------
// Database Validation Helpers
// ---------------------------------------------------------------------------

async function getActualCount(tableName: string): Promise<number> {
  const db = getDb();
  const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${tableName}`));
  return Number(result.rows[0]?.count || 0);
}

async function getSampleSlugs(
  tableName: string,
  count = 3,
  slugColumn = "slug"
): Promise<string[]> {
  const db = getDb();
  const result = await db.execute(
    sql.raw(`SELECT ${slugColumn} FROM ${tableName} LIMIT ${count}`)
  );
  return result.rows.map((row: any) => row[slugColumn] || row.slug);
}

async function getSampleIds(tableName: string, count = 3): Promise<string[]> {
  const db = getDb();
  const result = await db.execute(
    sql.raw(`SELECT id FROM ${tableName} LIMIT ${count}`)
  );
  return result.rows.map((row: any) => row.id);
}

// ---------------------------------------------------------------------------
// Entity Endpoint Tests
// ---------------------------------------------------------------------------

async function testUtilities() {
  info("\n📊 Testing /api/v1/utilities");

  // List endpoint
  await test("GET /api/v1/utilities returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/utilities");
    validatePaginatedResponse(data, EXPECTED_COUNTS.utilities);
    validateResponseTime(duration);
  });

  // Count validation
  await test("Utilities count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/utilities?limit=1");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.utilities);
  });

  // Required fields
  await test("Utilities have required fields", async () => {
    const { data } = await apiRequest("/api/v1/utilities?limit=5");
    assert(data.data.length > 0, "Should return at least one utility");
    const utility = data.data[0] as Record<string, unknown>;
    validateRequiredFields(utility, ["id", "slug", "name", "segment", "status"]);
  });

  // Pagination
  await test("Utilities pagination works", async () => {
    const { data: page1 } = await apiRequest("/api/v1/utilities?limit=10");
    assert(page1.data.length === 10, "First page should have 10 items");
    assert(page1.pagination.hasMore, "Should have more pages");
    assertExists(page1.pagination.cursor, "Should have cursor for next page");

    const { data: page2 } = await apiRequest(
      `/api/v1/utilities?limit=10&cursor=${encodeURIComponent(page1.pagination.cursor)}`
    );
    assert(page2.data.length > 0, "Second page should have items");
  });

  // Search
  await test("Utilities search works", async () => {
    const { data } = await apiRequest("/api/v1/utilities?q=electric");
    assert(data.data.length > 0, "Search should return results");
    assert(data.pagination.total > 0, "Search should have total count");
  });

  // Filters
  await test("Utilities segment filter works", async () => {
    const { data } = await apiRequest("/api/v1/utilities?segment=INVESTOR_OWNED");
    assert(data.data.length > 0, "Should return investor-owned utilities");
    const utility = data.data[0] as Record<string, unknown>;
    assertEqual(utility.segment, "INVESTOR_OWNED");
  });

  await test("Utilities status filter works", async () => {
    const { data } = await apiRequest("/api/v1/utilities?status=ACTIVE");
    assert(data.data.length > 0, "Should return active utilities");
    const utility = data.data[0] as Record<string, unknown>;
    assertEqual(utility.status, "ACTIVE");
  });

  // Sort
  await test("Utilities sorting works", async () => {
    const { data } = await apiRequest("/api/v1/utilities?sort=name&order=asc&limit=5");
    assert(data.data.length > 0, "Should return results");
  });

  // Limit parameter
  await test("Utilities limit=1 works", async () => {
    const { data } = await apiRequest("/api/v1/utilities?limit=1");
    assertEqual(data.data.length, 1);
  });

  await test("Utilities limit=100 works", async () => {
    const { data } = await apiRequest("/api/v1/utilities?limit=100");
    assertEqual(data.data.length, 100);
  });

  // Individual entity
  const slugs = await getSampleSlugs("utilities");
  for (const slug of slugs.slice(0, 3)) {
    await test(`GET /api/v1/utilities/${slug} returns entity`, async () => {
      const { data, duration } = await apiRequestSingle(`/api/v1/utilities/${slug}`);
      assertExists(data, "Should return utility data");
      const utility = data as Record<string, unknown>;
      assertEqual(utility.slug, slug);
      validateRequiredFields(utility, ["id", "slug", "name", "segment", "status"]);
      validateResponseTime(duration);
    });
  }
}

async function testIsos() {
  info("\n🔌 Testing /api/v1/isos");

  await test("GET /api/v1/isos returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/isos");
    validatePaginatedResponse(data, EXPECTED_COUNTS.isos);
    validateResponseTime(duration);
  });

  await test("ISOs count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/isos?limit=100");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.isos);
  });

  await test("ISOs have required fields", async () => {
    const { data } = await apiRequest("/api/v1/isos");
    assert(data.data.length > 0, "Should return ISOs");
    const iso = data.data[0] as Record<string, unknown>;
    validateRequiredFields(iso, ["id", "slug", "name"]);
  });

  const slugs = await getSampleSlugs("isos", 2);
  for (const slug of slugs) {
    await test(`GET /api/v1/isos/${slug} returns entity`, async () => {
      const { data } = await apiRequestSingle(`/api/v1/isos/${slug}`);
      const iso = data as Record<string, unknown>;
      assertEqual(iso.slug, slug);
    });
  }
}

async function testRtos() {
  info("\n🔌 Testing /api/v1/rtos");

  await test("GET /api/v1/rtos returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/rtos");
    validatePaginatedResponse(data, EXPECTED_COUNTS.rtos);
    validateResponseTime(duration);
  });

  await test("RTOs count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/rtos?limit=100");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.rtos);
  });

  await test("RTOs have required fields", async () => {
    const { data } = await apiRequest("/api/v1/rtos");
    assert(data.data.length > 0, "Should return RTOs");
    const rto = data.data[0] as Record<string, unknown>;
    validateRequiredFields(rto, ["id", "slug", "name"]);
  });

  const slugs = await getSampleSlugs("rtos", 2);
  for (const slug of slugs) {
    await test(`GET /api/v1/rtos/${slug} returns entity`, async () => {
      const { data } = await apiRequestSingle(`/api/v1/rtos/${slug}`);
      const rto = data as Record<string, unknown>;
      assertEqual(rto.slug, slug);
    });
  }
}

async function testBalancingAuthorities() {
  info("\n⚡ Testing /api/v1/balancing-authorities");

  await test("GET /api/v1/balancing-authorities returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/balancing-authorities");
    validatePaginatedResponse(data, EXPECTED_COUNTS.balancing_authorities);
    validateResponseTime(duration);
  });

  await test("Balancing authorities count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/balancing-authorities?limit=100");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.balancing_authorities);
  });

  await test("Balancing authorities have required fields", async () => {
    const { data } = await apiRequest("/api/v1/balancing-authorities");
    assert(data.data.length > 0, "Should return balancing authorities");
    const ba = data.data[0] as Record<string, unknown>;
    validateRequiredFields(ba, ["id", "slug", "name"]);
  });

  const slugs = await getSampleSlugs("balancing_authorities", 2);
  for (const slug of slugs) {
    await test(`GET /api/v1/balancing-authorities/${slug} returns entity`, async () => {
      const { data } = await apiRequestSingle(`/api/v1/balancing-authorities/${slug}`);
      const ba = data as Record<string, unknown>;
      assertEqual(ba.slug, slug);
    });
  }
}

async function testRegions() {
  info("\n🗺️  Testing /api/v1/regions");

  await test("GET /api/v1/regions returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/regions");
    validatePaginatedResponse(data, EXPECTED_COUNTS.regions);
    validateResponseTime(duration);
  });

  await test("Regions count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/regions?limit=1");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.regions);
  });

  await test("Regions have required fields", async () => {
    const { data } = await apiRequest("/api/v1/regions?limit=5");
    assert(data.data.length > 0, "Should return regions");
    const region = data.data[0] as Record<string, unknown>;
    validateRequiredFields(region, ["id", "slug", "name"]);
  });

  await test("Regions pagination works", async () => {
    const { data: page1 } = await apiRequest("/api/v1/regions?limit=10");
    assert(page1.data.length === 10, "First page should have 10 items");
    assert(page1.pagination.hasMore, "Should have more pages");
  });

  const slugs = await getSampleSlugs("regions", 2);
  for (const slug of slugs) {
    await test(`GET /api/v1/regions/${slug} returns entity`, async () => {
      const { data } = await apiRequestSingle(`/api/v1/regions/${slug}`);
      const region = data as Record<string, unknown>;
      assertEqual(region.slug, slug);
    });
  }
}

async function testPowerPlants() {
  info("\n🏭 Testing /api/v1/power-plants");

  await test("GET /api/v1/power-plants returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/power-plants");
    validatePaginatedResponse(data, EXPECTED_COUNTS.power_plants);
    validateResponseTime(duration);
  });

  await test("Power plants count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/power-plants?limit=1");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.power_plants);
  });

  await test("Power plants have required fields", async () => {
    const { data } = await apiRequest("/api/v1/power-plants?limit=5");
    assert(data.data.length > 0, "Should return power plants");
    const plant = data.data[0] as Record<string, unknown>;
    validateRequiredFields(plant, ["id", "slug", "name"]);
  });

  await test("Power plants search works", async () => {
    const { data } = await apiRequest("/api/v1/power-plants?q=solar");
    assert(data.data.length > 0, "Search should return results");
  });

  await test("Power plants limit parameter works", async () => {
    const { data } = await apiRequest("/api/v1/power-plants?limit=50");
    assert(data.data.length === 50, "Should return 50 results");
  });

  const slugs = await getSampleSlugs("power_plants", 3);
  for (const slug of slugs) {
    await test(`GET /api/v1/power-plants/${slug} returns entity`, async () => {
      const { data } = await apiRequestSingle(`/api/v1/power-plants/${slug}`);
      const plant = data as Record<string, unknown>;
      assertEqual(plant.slug, slug);
    });
  }
}

async function testEvStations() {
  info("\n🔌 Testing /api/v1/ev-stations");

  await test("GET /api/v1/ev-stations returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/ev-stations");
    validatePaginatedResponse(data, EXPECTED_COUNTS.ev_stations);
    validateResponseTime(duration);
  });

  await test("EV stations count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/ev-stations?limit=1");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.ev_stations);
  });

  await test("EV stations have required fields", async () => {
    const { data } = await apiRequest("/api/v1/ev-stations?limit=5");
    assert(data.data.length > 0, "Should return EV stations");
    const station = data.data[0] as Record<string, unknown>;
    validateRequiredFields(station, ["id", "slug"]);
  });

  await test("EV stations search works", async () => {
    const { data } = await apiRequest("/api/v1/ev-stations?q=tesla");
    // Search may or may not return results depending on data
    validatePaginatedResponse(data);
  });

  const slugs = await getSampleSlugs("ev_stations", 2);
  for (const slug of slugs) {
    await test(`GET /api/v1/ev-stations/${slug} returns entity`, async () => {
      const { data } = await apiRequestSingle(`/api/v1/ev-stations/${slug}`);
      const station = data as Record<string, unknown>;
      assertEqual(station.slug, slug);
    });
  }
}

async function testTransmissionLines() {
  info("\n⚡ Testing /api/v1/transmission-lines");

  await test("GET /api/v1/transmission-lines returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/transmission-lines");
    validatePaginatedResponse(data, EXPECTED_COUNTS.transmission_lines);
    validateResponseTime(duration);
  });

  await test("Transmission lines count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/transmission-lines?limit=1");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.transmission_lines);
  });

  await test("Transmission lines have required fields", async () => {
    const { data } = await apiRequest("/api/v1/transmission-lines?limit=5");
    assert(data.data.length > 0, "Should return transmission lines");
    const line = data.data[0] as Record<string, unknown>;
    validateRequiredFields(line, ["id"]);
  });

  // Note: transmission lines use id, not slug
  const ids = await getSampleIds("transmission_lines", 2);
  for (const id of ids) {
    await test(`GET /api/v1/transmission-lines/${id} returns entity`, async () => {
      const { data } = await apiRequestSingle(`/api/v1/transmission-lines/${id}`);
      const line = data as Record<string, unknown>;
      assertEqual(line.id, id);
    });
  }
}

async function testPricingNodes() {
  info("\n💰 Testing /api/v1/pricing-nodes");

  await test("GET /api/v1/pricing-nodes returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/pricing-nodes");
    validatePaginatedResponse(data, EXPECTED_COUNTS.pricing_nodes);
    validateResponseTime(duration);
  });

  await test("Pricing nodes count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/pricing-nodes?limit=1");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.pricing_nodes);
  });

  await test("Pricing nodes have required fields", async () => {
    const { data } = await apiRequest("/api/v1/pricing-nodes?limit=5");
    assert(data.data.length > 0, "Should return pricing nodes");
    const node = data.data[0] as Record<string, unknown>;
    validateRequiredFields(node, ["id", "slug"]);
  });

  const slugs = await getSampleSlugs("pricing_nodes", 2);
  for (const slug of slugs) {
    await test(`GET /api/v1/pricing-nodes/${slug} returns entity`, async () => {
      const { data } = await apiRequestSingle(`/api/v1/pricing-nodes/${slug}`);
      const node = data as Record<string, unknown>;
      assertEqual(node.slug, slug);
    });
  }
}

async function testPrograms() {
  info("\n📋 Testing /api/v1/programs");

  await test("GET /api/v1/programs returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/programs");
    validatePaginatedResponse(data, EXPECTED_COUNTS.programs);
    validateResponseTime(duration);
  });

  await test("Programs count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/programs?limit=1");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.programs);
  });

  await test("Programs have required fields", async () => {
    const { data } = await apiRequest("/api/v1/programs?limit=5");
    assert(data.data.length > 0, "Should return programs");
    const program = data.data[0] as Record<string, unknown>;
    validateRequiredFields(program, ["id", "slug"]);
  });

  await test("Programs search works", async () => {
    const { data } = await apiRequest("/api/v1/programs?q=solar");
    validatePaginatedResponse(data);
  });

  const slugs = await getSampleSlugs("programs", 2);
  for (const slug of slugs) {
    await test(`GET /api/v1/programs/${slug} returns entity`, async () => {
      const { data } = await apiRequestSingle(`/api/v1/programs/${slug}`);
      const program = data as Record<string, unknown>;
      assertEqual(program.slug, slug);
    });
  }
}

async function testTerritories() {
  info("\n🗺️  Testing /api/v1/territories");

  await test("GET /api/v1/territories returns paginated response", async () => {
    const { data, duration } = await apiRequest("/api/v1/territories");
    validatePaginatedResponse(data, EXPECTED_COUNTS.territories);
    validateResponseTime(duration);
  });

  await test("Territories count matches expected", async () => {
    const { data } = await apiRequest("/api/v1/territories?limit=1");
    assertEqual(data.pagination.total, EXPECTED_COUNTS.territories);
  });

  await test("Territories have required fields", async () => {
    const { data } = await apiRequest("/api/v1/territories?limit=5");
    assert(data.data.length > 0, "Should return territories");
    const territory = data.data[0] as Record<string, unknown>;
    validateRequiredFields(territory, ["id"]);
  });

  await test("Territories search works", async () => {
    const { data } = await apiRequest("/api/v1/territories?q=california");
    validatePaginatedResponse(data);
  });
}

// ---------------------------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║         CommonGrid API Test Harness                           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

  info(`Testing API at: ${API_BASE_URL}`);
  info(`Response time target: ${RESPONSE_TIME_TARGET_MS}ms\n`);

  const startTime = performance.now();

  try {
    await testUtilities();
    await testIsos();
    await testRtos();
    await testBalancingAuthorities();
    await testRegions();
    await testPowerPlants();
    await testEvStations();
    await testTransmissionLines();
    await testPricingNodes();
    await testPrograms();
    await testTerritories();
  } catch (error) {
    console.error("\n❌ Test suite failed with error:", error);
    process.exit(1);
  }

  const totalDuration = performance.now() - startTime;

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  if (failed === 0) {
    console.log(`${colors.green}✓ All ${total} tests passed!${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ ${failed}/${total} tests failed${colors.reset}`);
    console.log(`${colors.green}✓ ${passed}/${total} tests passed${colors.reset}`);
  }

  // Performance summary
  const avgResponseTime =
    results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  console.log(
    `\nAverage response time: ${avgResponseTime.toFixed(0)}ms (target: ${RESPONSE_TIME_TARGET_MS}ms)`
  );
  console.log(`Total test duration: ${(totalDuration / 1000).toFixed(2)}s`);

  // Failed tests detail
  if (failed > 0) {
    console.log(`\n${colors.red}FAILURES:${colors.reset}`);
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`  ${colors.red}✗${colors.reset} ${result.name}`);
      if (result.error) {
        console.log(`    ${colors.dim}${result.error}${colors.reset}`);
      }
    }
  }

  console.log(`\n${"=".repeat(70)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
