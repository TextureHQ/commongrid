/**
 * Data loading abstraction for programs.
 *
 * Reads from Postgres via Drizzle.
 */

import type {
  AssetType,
  CompensationType,
  CompensationUnit,
  GridService,
  MarketSegment,
  Program,
  ProgramOrganization,
  ProgramOrganizationRole,
  ProgramStatus,
} from "@/types/programs";

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
  /**
   * Entity slug of an organization associated with the program (any role).
   * Matches against `organizations[].entityId` — e.g. `vermont-electric-cooperative`
   * returns every program that utility administers or participates in.
   */
  organization?: string;
  /**
   * Narrow `organization` to a single role, e.g. `ADMINISTRATOR`. Ignored when
   * `organization` is absent.
   */
  organizationRole?: string;
}

// ---------------------------------------------------------------------------
// Data normalization
// ---------------------------------------------------------------------------

/**
 * Normalize organizations from the DB into the typed ProgramOrganization shape.
 *
 * In the current seed data, organizations is stored as a flat array of utility
 * slugs (e.g. ["util-001"]).  This normalizer treats bare strings as ADMINISTRATOR
 * entries so callers always receive `ProgramOrganization[]`.
 */
function normalizeOrganizations(raw: unknown): ProgramOrganization[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      // Already a proper object with entityId
      if (item !== null && typeof item === "object" && !Array.isArray(item) && "entityId" in item) {
        return item as ProgramOrganization;
      }
      // Legacy flat string — treat as ADMINISTRATOR
      if (typeof item === "string" && item.length > 0) {
        return { entityId: item, role: "ADMINISTRATOR" as ProgramOrganizationRole };
      }
      return null;
    })
    .filter((o): o is ProgramOrganization => o !== null);
}

/**
 * Normalize compensation_tiers from the DB into the typed CompensationTier shape.
 *
 * Seed data stores tiers as flat strings (e.g. ["flat-rate"]). This normalizer
 * converts bare strings into minimal CompensationTier objects so callers never
 * see a raw string.
 */
function normalizeCompensationTiers(raw: unknown): Program["compensationTiers"] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (item !== null && typeof item === "object" && !Array.isArray(item) && "type" in item) {
        return item as Program["compensationTiers"][number];
      }
      if (typeof item === "string" && item.length > 0) {
        return { tier: 1, type: "FLAT" as CompensationType, amount: 0, unit: "FLAT" as CompensationUnit };
      }
      return null;
    })
    .filter((t): t is Program["compensationTiers"][number] => t !== null);
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

export function dbRowToProgram(row: Record<string, unknown>): Program {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string | null) ?? undefined,
    organizations: normalizeOrganizations(row.organizations),
    assetTypes: (row.assetTypes as AssetType[]) ?? [],
    marketSegments: (row.marketSegments as MarketSegment[]) ?? [],
    participationModels: (row.participationModels as Program["participationModels"]) ?? [],
    incentiveStructures: (row.incentiveStructures as Program["incentiveStructures"]) ?? [],
    gridServices: (row.gridServices as GridService[]) ?? [],
    regions: (row.regions as string[]) ?? [],
    compensationTiers: normalizeCompensationTiers(row.compensationTiers),
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
    version: (row.version as number | null) ?? undefined,
    createdAt: row.createdAt instanceof Date ? (row.createdAt as Date).toISOString() : (row.createdAt as string),
    updatedAt: row.updatedAt instanceof Date ? (row.updatedAt as Date).toISOString() : (row.updatedAt as string),
  };
}

async function loadFromDb(filters?: ProgramFilters): Promise<Program[]> {
  const { getDb } = await import("@/lib/db/client");
  const { programs } = await import("@/lib/db/schema");
  const { eq, ilike, and, isNull } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];

  // Exclude soft-deleted entities
  conditions.push(isNull(programs.deletedAt));
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
      version: programs.version,
      createdAt: programs.createdAt,
      updatedAt: programs.updatedAt,
    })
    .from(programs)
    .where(and(...conditions));

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

  // Organization association filter. Applied post-normalization so it works
  // uniformly across both storage shapes handled by normalizeOrganizations()
  // (object entries and legacy bare slug strings).
  if (filters?.organization) {
    const wantedEntity = filters.organization;
    const wantedRole = filters.organizationRole;
    result = result.filter((p) =>
      p.organizations.some((o) => o.entityId === wantedEntity && (!wantedRole || o.role === wantedRole))
    );
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
      version: programs.version,
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
 */
export async function loadPrograms(filters?: ProgramFilters): Promise<Program[]> {
  return loadFromDb(filters);
}

/**
 * Load a single program by slug.
 * Returns null if not found.
 */
export async function loadProgramBySlug(slug: string): Promise<Program | null> {
  return loadBySlugFromDb(slug);
}
