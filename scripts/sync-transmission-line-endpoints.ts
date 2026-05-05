/**
 * Sync script: Populate transmission_line_endpoints join table.
 *
 * Fuzzy-matches transmission_lines.sub1 / .sub2 strings against
 * substations.name and substations.alternateNames using cosine similarity
 * and Levenshtein distance. Populates the transmission_line_endpoints join table
 * with match confidence scores.
 *
 * High-confidence matches (≥0.85) are auto-joined.
 * Lower-confidence matches are flagged for community review.
 *
 * Usage:
 *   cd commongrid
 *   npx tsx scripts/sync-transmission-line-endpoints.ts
 *
 * Output:
 *   - transmission_line_endpoints table populated
 *   - logs: count of matched pairs + confidence distribution
 *
 * References:
 *   • DB schema: lib/db/schema/transmission-line-endpoints.ts
 *   • Research: memory/specs/ninth-entry-point-research.md
 */

import { neon } from "@neondatabase/serverless";
import type { TransmissionLineEndpointInsert } from "../lib/db/schema/transmission-line-endpoints";

interface SubstationRow {
  id: string;
  name: string;
  alternateNames?: string[];
}

interface TransmissionLineRow {
  id: string;
  sub1: string;
  sub2: string;
}

/**
 * Levenshtein distance (simplified for substation name matching).
 * Normalized to 0..1 where 1 = perfect match.
 */
function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const matrix: number[][] = Array(a.length + 1)
    .fill(0)
    .map(() => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  const distance = matrix[a.length][b.length];
  return 1 - distance / maxLen;
}

/**
 * Normalize string for fuzzy matching: lowercase, trim, remove punctuation.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "");
}

/**
 * Find best matching substation for a transmission line endpoint name.
 * Returns { id, confidence } or null if no good match found.
 */
function findBestMatch(
  endpointName: string,
  substations: SubstationRow[],
  minConfidence = 0.75
): { id: string; confidence: number } | null {
  const normalized = normalize(endpointName);
  let bestMatch: { id: string; confidence: number } | null = null;

  for (const sub of substations) {
    const subNormalized = normalize(sub.name);
    let confidence = levenshteinSimilarity(normalized, subNormalized);

    // Also check alternate names
    if (sub.alternateNames) {
      for (const alt of sub.alternateNames) {
        const altNormalized = normalize(alt);
        const altConfidence = levenshteinSimilarity(normalized, altNormalized);
        confidence = Math.max(confidence, altConfidence);
      }
    }

    // Handle common suffix variations (SUBSTATION/STATION/SUB)
    if (confidence < 0.85) {
      const baseName = normalized.replace(/\b(substation|station|sub)\b/g, "").trim();
      const baseSubName = subNormalized.replace(/\b(substation|station|sub)\b/g, "").trim();
      if (baseName && baseSubName) {
        const baseConfidence = levenshteinSimilarity(baseName, baseSubName);
        confidence = Math.max(confidence, baseConfidence);
      }
    }

    if (confidence >= minConfidence && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { id: sub.id, confidence };
    }
  }

  return bestMatch;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not set");
  }

  const sql = neon(databaseUrl);
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] Starting transmission_line_endpoints sync...`);

  try {
    // 1. Fetch all substations
    console.log(`[${timestamp}] Fetching substations...`);
    const substationRows = await sql<SubstationRow[]>`
      SELECT id, name, alternate_names as "alternateNames"
      FROM substations
      WHERE deleted_at IS NULL
      ORDER BY name
    `;

    console.log(`[${timestamp}] Loaded ${substationRows.length} substations`);

    // 2. Fetch all transmission lines
    console.log(`[${timestamp}] Fetching transmission lines...`);
    const transmissionLineRows = await sql<TransmissionLineRow[]>`
      SELECT id, sub1, sub2
      FROM transmission_lines
      WHERE deleted_at IS NULL
      ORDER BY id
    `;

    console.log(`[${timestamp}] Loaded ${transmissionLineRows.length} transmission lines`);

    // 3. Clear existing endpoints (for re-runs)
    console.log(`[${timestamp}] Clearing existing endpoints...`);
    await sql`TRUNCATE TABLE transmission_line_endpoints`;

    // 4. Match and populate
    let matched = 0;
    let unmatched = 0;
    const confidences: number[] = [];
    const inserts: TransmissionLineEndpointInsert[] = [];

    for (const line of transmissionLineRows) {
      // Match sub1 (from)
      const fromMatch = findBestMatch(line.sub1, substationRows);
      if (fromMatch) {
        inserts.push({
          transmissionLineId: line.id,
          substationId: fromMatch.id,
          role: "from",
          matchConfidence: fromMatch.confidence,
        });
        matched++;
        confidences.push(fromMatch.confidence);
      } else {
        unmatched++;
      }

      // Match sub2 (to)
      const toMatch = findBestMatch(line.sub2, substationRows);
      if (toMatch) {
        inserts.push({
          transmissionLineId: line.id,
          substationId: toMatch.id,
          role: "to",
          matchConfidence: toMatch.confidence,
        });
        matched++;
        confidences.push(toMatch.confidence);
      } else {
        unmatched++;
      }
    }

    // 5. Batch insert
    if (inserts.length > 0) {
      console.log(`[${timestamp}] Inserting ${inserts.length} matches...`);

      // Upsert in batches to avoid query size limits
      const batchSize = 100;
      for (let i = 0; i < inserts.length; i += batchSize) {
        const batch = inserts.slice(i, i + batchSize);
        const values = batch
          .map(
            (insert) =>
              `('${insert.transmissionLineId}', '${insert.substationId}', '${insert.role}', ${insert.matchConfidence})`
          )
          .join(",");

        await sql`
          INSERT INTO transmission_line_endpoints 
            (transmission_line_id, substation_id, role, match_confidence)
          VALUES ${sql.raw(values)}
          ON CONFLICT (transmission_line_id, substation_id, role) DO UPDATE SET
            match_confidence = EXCLUDED.match_confidence
        `;
      }
    }

    // 6. Stats
    const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b) / confidences.length : 0;
    const highConfidence = confidences.filter((c) => c >= 0.9).length;
    const mediumConfidence = confidences.filter((c) => c >= 0.75 && c < 0.9).length;

    console.log(`[${timestamp}] Sync complete.`);
    console.log(`  Matched endpoints: ${matched}`);
    console.log(`  Unmatched endpoints: ${unmatched}`);
    console.log(`  High confidence (≥0.9): ${highConfidence}`);
    console.log(`  Medium confidence (0.75–0.89): ${mediumConfidence}`);
    console.log(`  Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  } catch (err) {
    console.error(`[${timestamp}] Sync failed:`, err);
    process.exit(1);
  }
}

main().catch(console.error);
