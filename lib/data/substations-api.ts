/**
 * Data loaders for substations API endpoints.
 * Mirrors the patterns used in power-plants-api.ts and transmission-lines-api.ts.
 */

import { db } from "@/lib/db";
import { substations } from "@/lib/db/schema/substations";
import type { SubstationDetail } from "@/types/entities";
import {
  eq,
  ilike,
  and,
  or,
  inArray,
  desc,
  asc,
} from "drizzle-orm";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Single-row loaders
// ---------------------------------------------------------------------------

/**
 * Load a single substation by slug.
 * Returns full detail including owner, operator, grid context, etc.
 */
export async function loadSubstationBySlug(slug: string): Promise<SubstationDetail | null> {
  const result = await db
    .select()
    .from(substations)
    .where(and(eq(substations.slug, slug), eq(substations.deletedAt, null)))
    .limit(1);

  return result[0] || null;
}

/**
 * Load a single substation by ID.
 */
export async function loadSubstationById(id: string): Promise<SubstationDetail | null> {
  const result = await db
    .select()
    .from(substations)
    .where(and(eq(substations.id, id), eq(substations.deletedAt, null)))
    .limit(1);

  return result[0] || null;
}

// ---------------------------------------------------------------------------
// List + filter loaders
// ---------------------------------------------------------------------------

export interface SubstationFilterOptions {
  state?: string;
  voltageClass?: string;
  status?: string;
  utilityId?: string;
  baId?: string;
  isoId?: string;
  search?: string;
  sortField?: "name" | "state" | "maxVoltageKv";
  order?: "asc" | "desc";
  limit: number;
  offset: number;
}

/**
 * Load substations with filtering, sorting, and pagination.
 * Returns paginated results ready for API response.
 */
export async function loadSubstations(
  options: SubstationFilterOptions
): Promise<SubstationDetail[]> {
  const {
    state,
    voltageClass,
    status,
    utilityId,
    baId,
    isoId,
    search,
    sortField = "name",
    order = "asc",
    limit,
    offset,
  } = options;

  // Build WHERE clause
  const conditions = [eq(substations.deletedAt, null)];

  if (state) {
    conditions.push(eq(substations.state, state.toUpperCase()));
  }

  if (voltageClass) {
    conditions.push(eq(substations.voltageClass, voltageClass));
  }

  if (status) {
    conditions.push(eq(substations.status, status));
  }

  if (utilityId) {
    conditions.push(eq(substations.utilityId, utilityId));
  }

  if (baId) {
    conditions.push(eq(substations.balancingAuthorityId, baId));
  }

  if (isoId) {
    conditions.push(eq(substations.isoId, isoId));
  }

  // Search: name, owner, state (case-insensitive substring)
  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        ilike(substations.name, searchPattern),
        ilike(substations.owner, searchPattern),
        ilike(substations.state, searchPattern)
      )
    );
  }

  // Build ORDER clause
  let orderClause;
  const orderDir = order === "desc" ? desc : asc;

  if (sortField === "maxVoltageKv") {
    orderClause = [orderDir(substations.maxVoltageKv), asc(substations.name), asc(substations.id)];
  } else {
    orderClause = [orderDir(substations[sortField]), asc(substations.id)];
  }

  const results = await db
    .select()
    .from(substations)
    .where(and(...conditions))
    .orderBy(...orderClause)
    .limit(limit + 1) // Fetch one extra to detect if more results exist
    .offset(offset);

  return results;
}

/**
 * Count substations matching filter criteria.
 * Used for total count and pagination metadata.
 */
export async function countSubstations(
  options: Omit<SubstationFilterOptions, "sortField" | "order" | "limit" | "offset">
): Promise<number> {
  const {
    state,
    voltageClass,
    status,
    utilityId,
    baId,
    isoId,
    search,
  } = options;

  const conditions = [eq(substations.deletedAt, null)];

  if (state) {
    conditions.push(eq(substations.state, state.toUpperCase()));
  }

  if (voltageClass) {
    conditions.push(eq(substations.voltageClass, voltageClass));
  }

  if (status) {
    conditions.push(eq(substations.status, status));
  }

  if (utilityId) {
    conditions.push(eq(substations.utilityId, utilityId));
  }

  if (baId) {
    conditions.push(eq(substations.balancingAuthorityId, baId));
  }

  if (isoId) {
    conditions.push(eq(substations.isoId, isoId));
  }

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        ilike(substations.name, searchPattern),
        ilike(substations.owner, searchPattern),
        ilike(substations.state, searchPattern)
      )
    );
  }

  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(substations)
    .where(and(...conditions));

  return result[0]?.count ?? 0;
}
