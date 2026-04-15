/**
 * Data loading abstraction for programs.
 *
 * Reads from static JSON (default) or Postgres via Drizzle, controlled by
 * the NEXT_PUBLIC_FF_DB_PROGRAMS feature flag.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDataSource } from "@/lib/feature-flags";
import type { AssetType, GridService, MarketSegment, Program, ProgramStatus } from "@/types/programs";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface ProgramFilters {
  status?: string;
  assetType?: string;
  marketSegment?: string;
  gridService?: string;
  /** Min 2 chars. Matches against name and slug (case-insensitive). */
  search?: string;
}

// ---------------------------------------------------------------------------
// JSON source
// ---------------------------------------------------------------------------

let _jsonCache: Program[] | null = null;

function loadJson(): Program[] {
  if (_jsonCache) return _jsonCache;
  const filePath = join(process.cwd(), "data", "programs.json");
  _jsonCache = JSON.parse(readFileSync(filePath, "utf-8")) as Program[];
  return _jsonCache;
}

function applyJsonFilters(programs: Program[], filters: ProgramFilters): Program[] {
  let result = programs;

  if (filters.status) {
    result = result.filter((p) => p.status === filters.status);
  }
  if (filters.assetType) {
    result = result.filter((p) => p.assetTypes.includes(filters.assetType as AssetType));
  }
  if (filters.marketSegment) {
    result = result.filter((p) => p.marketSegments.includes(filters.marketSegment as MarketSegment));
  }
  if (filters.gridService) {
    result = result.filter((p) => p.gridServices.includes(filters.gridService as GridService));
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
  }

  return result;
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

function dbRowToProgram(row: Record<string, unknown>): Program {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string | null) ?? undefined,
    organizations: (row.organizations as Program["organizations"]) ?? [],
    assetTypes: (row.assetTypes as AssetType[]) ?? [],
    marketSegments: (row.marketSegments as MarketSegment[]) ?? [],
    participationModels: (row.participationModels as Program["participationModels"]) ?? [],
    incentiveStructures: (row.incentiveStructures as Program["incentiveStructures"]) ?? [],
    gridServices: (row.gridServices as GridService[]) ?? [],
    regions: (row.regions as string[]) ?? [],
    compensationTiers: (row.compensationTiers as Program["compensationTiers"]) ?? [],
    capacityTarget: (row.capacityTarget as number | null) ?? undefined,
    maxEnrollments: (row.maxEnrollments as number | null) ?? undefined,
    programSeason: (row.programSeason as Program["programSeason"]) ?? undefined,
    launchedAt: (row.launchedAt as string | null) ?? undefined,
    enrollmentOpens: (row.enrollmentOpens as string | null) ?? undefined,
    enrollmentCloses: (row.enrollmentCloses as string | null) ?? undefined,
    endsAt: (row.endsAt as string | null) ?? undefined,
    status: row.status as ProgramStatus,
    programWebsite: (row.programWebsite as string | null) ?? undefined,
    faqUrl: (row.faqUrl as string | null) ?? undefined,
    termsUrl: (row.termsUrl as string | null) ?? undefined,
    contactUrl: (row.contactUrl as string | null) ?? undefined,
    variants: (row.variants as Program["variants"]) ?? [],
    createdAt: row.createdAt instanceof Date ? (row.createdAt as Date).toISOString() : (row.createdAt as string),
    updatedAt: row.updatedAt instanceof Date ? (row.updatedAt as Date).toISOString() : (row.updatedAt as string),
  };
}

async function loadFromDb(filters?: ProgramFilters): Promise<Program[]> {
  const { getDb } = await import("@/lib/db/client");
  const { programs } = await import("@/lib/db/schema");
  const { eq, ilike, and } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];

  if (filters?.status) conditions.push(eq(programs.status, filters.status));
  if (filters?.search) conditions.push(ilike(programs.name, `%${filters.search}%`));

  const rows = await db
    .select({
      id: programs.id,
      slug: programs.slug,
      name: programs.name,
      description: programs.description,
      organizations: programs.organizations,
      assetTypes: programs.assetTypes,
      marketSegments: programs.marketSegments,
      participationModels: programs.participationModels,
      incentiveStructures: programs.incentiveStructures,
      gridServices: programs.gridServices,
      regions: programs.regions,
      compensationTiers: programs.compensationTiers,
      capacityTarget: programs.capacityTarget,
      maxEnrollments: programs.maxEnrollments,
      programSeason: programs.programSeason,
      launchedAt: programs.launchedAt,
      enrollmentOpens: programs.enrollmentOpens,
      enrollmentCloses: programs.enrollmentCloses,
      endsAt: programs.endsAt,
      status: programs.status,
      programWebsite: programs.programWebsite,
      faqUrl: programs.faqUrl,
      termsUrl: programs.termsUrl,
      contactUrl: programs.contactUrl,
      variants: programs.variants,
      createdAt: programs.createdAt,
      updatedAt: programs.updatedAt,
    })
    .from(programs)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  let result = rows.map(dbRowToProgram);

  // Apply array-based filters in memory (JSONB array contains)
  if (filters?.assetType) {
    result = result.filter((p) => p.assetTypes.includes(filters.assetType as AssetType));
  }
  if (filters?.marketSegment) {
    result = result.filter((p) => p.marketSegments.includes(filters.marketSegment as MarketSegment));
  }
  if (filters?.gridService) {
    result = result.filter((p) => p.gridServices.includes(filters.gridService as GridService));
  }

  return result;
}

async function loadBySlugFromDb(slug: string): Promise<Program | null> {
  const { getDb } = await import("@/lib/db/client");
  const { programs } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const db = getDb();
  const rows = await db
    .select({
      id: programs.id,
      slug: programs.slug,
      name: programs.name,
      description: programs.description,
      organizations: programs.organizations,
      assetTypes: programs.assetTypes,
      marketSegments: programs.marketSegments,
      participationModels: programs.participationModels,
      incentiveStructures: programs.incentiveStructures,
      gridServices: programs.gridServices,
      regions: programs.regions,
      compensationTiers: programs.compensationTiers,
      capacityTarget: programs.capacityTarget,
      maxEnrollments: programs.maxEnrollments,
      programSeason: programs.programSeason,
      launchedAt: programs.launchedAt,
      enrollmentOpens: programs.enrollmentOpens,
      enrollmentCloses: programs.enrollmentCloses,
      endsAt: programs.endsAt,
      status: programs.status,
      programWebsite: programs.programWebsite,
      faqUrl: programs.faqUrl,
      termsUrl: programs.termsUrl,
      contactUrl: programs.contactUrl,
      variants: programs.variants,
      createdAt: programs.createdAt,
      updatedAt: programs.updatedAt,
    })
    .from(programs)
    .where(eq(programs.slug, slug))
    .limit(1);

  return rows.length > 0 ? dbRowToProgram(rows[0] as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load programs, optionally filtered.
 * Uses JSON or DB depending on the NEXT_PUBLIC_FF_DB_PROGRAMS flag.
 */
export async function loadPrograms(filters?: ProgramFilters): Promise<Program[]> {
  if (getDataSource("programs") === "database") {
    return loadFromDb(filters);
  }

  const programs = loadJson();
  return filters ? applyJsonFilters(programs, filters) : programs;
}

/**
 * Load a single program by slug.
 * Returns null if not found.
 */
export async function loadProgramBySlug(slug: string): Promise<Program | null> {
  if (getDataSource("programs") === "database") {
    return loadBySlugFromDb(slug);
  }

  const programs = loadJson();
  return programs.find((p) => p.slug === slug) ?? null;
}
