/**
 * Metadata-only entity fetchers.
 *
 * These exist so `generateMetadata` can resolve a page title server-side
 * without paying for the full detail-page query. Each one selects only the
 * handful of columns that appear in a `<title>` or `<meta description>`, and
 * every one returns `null` rather than throwing so a metadata failure can
 * never take down a page render.
 *
 * Pattern borrowed from the Texture dashboard's `fetchSiteForMetadata`.
 *
 * Note: all queries filter `deletedAt IS NULL` — the database uses soft
 * deletes, and a deleted record should fall back to the generic title.
 */

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  balancingAuthorities,
  evStations,
  powerPlants,
  pricingNodes,
  substations,
  transmissionLines,
  utilities,
} from "@/lib/db/schema";

/** Statuses whose records are stubs pointing at a live successor. */
const REDIRECT_STATUSES = new Set(["MERGED", "ACQUIRED"]);

export interface UtilityMetadata {
  name: string;
  segment: string | null;
}

/**
 * Resolve a utility (grid operator) slug to its display name.
 *
 * Follows MERGED/ACQUIRED successors so the title matches what the page
 * actually renders — `/api/v1/utilities/[slug]` does the same, and a title
 * showing the deprecated stub name while the body shows the successor would
 * be worse than no title at all.
 */
export async function fetchUtilityForMetadata(slug: string): Promise<UtilityMetadata | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        name: utilities.name,
        segment: utilities.segment,
        status: utilities.status,
        successorId: utilities.successorId,
      })
      .from(utilities)
      .where(and(eq(utilities.slug, slug), isNull(utilities.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    if (row.status && REDIRECT_STATUSES.has(row.status) && row.successorId) {
      const successorRows = await db
        .select({ name: utilities.name, segment: utilities.segment })
        .from(utilities)
        .where(and(eq(utilities.id, row.successorId), isNull(utilities.deletedAt)))
        .limit(1);
      const successor = successorRows[0];
      if (successor) {
        return { name: successor.name, segment: successor.segment };
      }
    }

    return { name: row.name, segment: row.segment };
  } catch {
    return null;
  }
}

export interface BalancingAuthorityMetadata {
  name: string;
  shortName: string | null;
  states: string[];
}

export async function fetchBalancingAuthorityForMetadata(slug: string): Promise<BalancingAuthorityMetadata | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        name: balancingAuthorities.name,
        shortName: balancingAuthorities.shortName,
        states: balancingAuthorities.states,
      })
      .from(balancingAuthorities)
      .where(and(eq(balancingAuthorities.slug, slug), isNull(balancingAuthorities.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return { name: row.name, shortName: row.shortName, states: row.states ?? [] };
  } catch {
    return null;
  }
}

export interface PowerPlantMetadata {
  name: string;
  state: string | null;
  primaryFuel: string | null;
  totalCapacityMw: number | null;
}

export async function fetchPowerPlantForMetadata(slug: string): Promise<PowerPlantMetadata | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        name: powerPlants.name,
        state: powerPlants.state,
        primaryFuel: powerPlants.primaryFuel,
        totalCapacityMw: powerPlants.totalCapacityMw,
      })
      .from(powerPlants)
      .where(and(eq(powerPlants.slug, slug), isNull(powerPlants.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export interface EvStationMetadata {
  stationName: string;
  city: string | null;
  state: string | null;
  evNetwork: string | null;
}

export async function fetchEvStationForMetadata(slug: string): Promise<EvStationMetadata | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        stationName: evStations.stationName,
        city: evStations.city,
        state: evStations.state,
        evNetwork: evStations.evNetwork,
      })
      .from(evStations)
      .where(and(eq(evStations.slug, slug), isNull(evStations.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export interface PricingNodeMetadata {
  name: string;
  iso: string | null;
  nodeType: string | null;
  state: string | null;
}

export async function fetchPricingNodeForMetadata(slug: string): Promise<PricingNodeMetadata | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        name: pricingNodes.name,
        iso: pricingNodes.iso,
        nodeType: pricingNodes.nodeType,
        state: pricingNodes.state,
      })
      .from(pricingNodes)
      .where(and(eq(pricingNodes.slug, slug), isNull(pricingNodes.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export interface SubstationMetadata {
  name: string;
  state: string | null;
  ownerName: string | null;
  maxVoltageKv: number | null;
}

export async function fetchSubstationForMetadata(slug: string): Promise<SubstationMetadata | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        name: substations.name,
        state: substations.state,
        ownerName: substations.ownerName,
        maxVoltageKv: substations.maxVoltageKv,
      })
      .from(substations)
      .where(and(eq(substations.slug, slug), isNull(substations.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export interface TransmissionLineMetadata {
  id: string;
  owner: string;
  voltageClass: string;
  lengthMiles: number;
  sub1: string;
  sub2: string;
}

export async function fetchTransmissionLineForMetadata(id: string): Promise<TransmissionLineMetadata | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: transmissionLines.id,
        owner: transmissionLines.owner,
        voltageClass: transmissionLines.voltageClass,
        lengthMiles: transmissionLines.lengthMiles,
        sub1: transmissionLines.sub1,
        sub2: transmissionLines.sub2,
      })
      .from(transmissionLines)
      .where(and(eq(transmissionLines.id, id), isNull(transmissionLines.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}
