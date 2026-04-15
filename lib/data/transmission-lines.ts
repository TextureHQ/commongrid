/**
 * Data loading abstraction for transmission lines.
 *
 * Reads from static JSON (default) or Postgres via Drizzle, controlled by
 * the NEXT_PUBLIC_FF_DB_TRANSMISSION feature flag.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDataSource } from "@/lib/feature-flags";
import type { TransmissionLine, VoltageClass } from "@/types/transmission-lines";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface TransmissionLineFilters {
  voltageClass?: string;
  owner?: string;
  status?: string;
  /** Min 2 chars. Matches against owner (case-insensitive). */
  search?: string;
}

// ---------------------------------------------------------------------------
// JSON source
// ---------------------------------------------------------------------------

let _jsonCache: TransmissionLine[] | null = null;

function loadJson(): TransmissionLine[] {
  if (_jsonCache) return _jsonCache;
  const filePath = join(process.cwd(), "data", "transmission-lines.json");
  _jsonCache = JSON.parse(readFileSync(filePath, "utf-8")) as TransmissionLine[];
  return _jsonCache;
}

function applyJsonFilters(lines: TransmissionLine[], filters: TransmissionLineFilters): TransmissionLine[] {
  let result = lines;

  if (filters.voltageClass) {
    result = result.filter((l) => l.voltageClass === filters.voltageClass);
  }
  if (filters.owner) {
    result = result.filter((l) => l.owner === filters.owner);
  }
  if (filters.status) {
    result = result.filter((l) => l.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((l) => l.owner.toLowerCase().includes(q));
  }

  return result;
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

function dbRowToTransmissionLine(row: Record<string, unknown>): TransmissionLine {
  return {
    objectId: row.objectId as number,
    id: row.id as string,
    type: row.type as string,
    status: row.status as string,
    owner: row.owner as string,
    voltage: (row.voltage as number | null) ?? null,
    voltClass: row.voltClass as string,
    voltageClass: row.voltageClass as VoltageClass,
    sub1: row.sub1 as string,
    sub2: row.sub2 as string,
    lengthMiles: row.lengthMiles as number,
    naicsCode: row.naicsCode as string,
    source: row.source as string,
  };
}

async function loadFromDb(filters?: TransmissionLineFilters): Promise<TransmissionLine[]> {
  const { getDb } = await import("@/lib/db/client");
  const { transmissionLines } = await import("@/lib/db/schema");
  const { eq, ilike, and } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];

  if (filters?.voltageClass) conditions.push(eq(transmissionLines.voltageClass, filters.voltageClass));
  if (filters?.owner) conditions.push(eq(transmissionLines.owner, filters.owner));
  if (filters?.status) conditions.push(eq(transmissionLines.status, filters.status));
  if (filters?.search) conditions.push(ilike(transmissionLines.owner, `%${filters.search}%`));

  const rows = await db
    .select({
      id: transmissionLines.id,
      objectId: transmissionLines.objectId,
      type: transmissionLines.type,
      status: transmissionLines.status,
      owner: transmissionLines.owner,
      voltage: transmissionLines.voltage,
      voltClass: transmissionLines.voltClass,
      voltageClass: transmissionLines.voltageClass,
      sub1: transmissionLines.sub1,
      sub2: transmissionLines.sub2,
      lengthMiles: transmissionLines.lengthMiles,
      naicsCode: transmissionLines.naicsCode,
      source: transmissionLines.source,
    })
    .from(transmissionLines)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map(dbRowToTransmissionLine);
}

async function loadByIdFromDb(id: string): Promise<TransmissionLine | null> {
  const { getDb } = await import("@/lib/db/client");
  const { transmissionLines } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const db = getDb();
  const rows = await db
    .select({
      id: transmissionLines.id,
      objectId: transmissionLines.objectId,
      type: transmissionLines.type,
      status: transmissionLines.status,
      owner: transmissionLines.owner,
      voltage: transmissionLines.voltage,
      voltClass: transmissionLines.voltClass,
      voltageClass: transmissionLines.voltageClass,
      sub1: transmissionLines.sub1,
      sub2: transmissionLines.sub2,
      lengthMiles: transmissionLines.lengthMiles,
      naicsCode: transmissionLines.naicsCode,
      source: transmissionLines.source,
    })
    .from(transmissionLines)
    .where(eq(transmissionLines.id, id))
    .limit(1);

  return rows.length > 0 ? dbRowToTransmissionLine(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load transmission lines, optionally filtered.
 * Uses JSON or DB depending on the NEXT_PUBLIC_FF_DB_TRANSMISSION flag.
 */
export async function loadTransmissionLines(filters?: TransmissionLineFilters): Promise<TransmissionLine[]> {
  if (getDataSource("transmissionLines") === "db") {
    return loadFromDb(filters);
  }

  const lines = loadJson();
  return filters ? applyJsonFilters(lines, filters) : lines;
}

/**
 * Load a single transmission line by ID.
 * Returns null if not found.
 */
export async function loadTransmissionLineById(id: string): Promise<TransmissionLine | null> {
  if (getDataSource("transmissionLines") === "db") {
    return loadByIdFromDb(id);
  }

  const lines = loadJson();
  return lines.find((l) => l.id === id) ?? null;
}
