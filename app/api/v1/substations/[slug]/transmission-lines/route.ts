/**
 * GET /api/v1/substations/[slug]/transmission-lines
 *
 * List transmission lines connected to a specific substation.
 * Uses the transmission_line_endpoints join table to find all connected lines.
 */

import { neon } from "@neondatabase/serverless";
import { notFound } from "next/navigation";

interface ConnectedLineResult {
  lineId: string;
  lineName: string;
  lineVoltageClass: string;
  lineVoltage: number | null;
  lineStatus: string;
  lineOwner: string;
  role: "from" | "to";
  matchConfidence: number | null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const sql = neon(databaseUrl);

    // 1. Find substation by slug
    const substationResult = await sql`
      SELECT id FROM substations
      WHERE slug = ${slug} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (substationResult.length === 0) {
      return notFound();
    }

    const substationId = (substationResult[0] as { id: string }).id;

    // 2. Fetch connected transmission lines via join table
    const lines = (await sql`
      SELECT
        tl.id as "lineId",
        tl.name as "lineName",
        tl.voltage_class as "lineVoltageClass",
        tl.voltage as "lineVoltage",
        tl.status as "lineStatus",
        tl.owner as "lineOwner",
        tle.role,
        tle.match_confidence as "matchConfidence"
      FROM transmission_line_endpoints tle
      JOIN transmission_lines tl ON tle.transmission_line_id = tl.id
      WHERE
        tle.substation_id = ${substationId}
        AND tl.deleted_at IS NULL
      ORDER BY tle.role, tl.name
    `) as unknown as ConnectedLineResult[];

    // 3. Group by role
    const fromLines = lines.filter((l) => l.role === "from");
    const toLines = lines.filter((l) => l.role === "to");

    return Response.json(
      {
        substation_id: substationId,
        from_lines: fromLines,
        to_lines: toLines,
        total_connected: lines.length,
        confidence_distribution: {
          high: lines.filter((l) => (l.matchConfidence ?? 0) >= 0.9).length,
          medium: lines.filter((l) => (l.matchConfidence ?? 0) >= 0.75 && (l.matchConfidence ?? 0) < 0.9).length,
          low: lines.filter((l) => (l.matchConfidence ?? 0) < 0.75).length,
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching transmission lines for substation:", error);
    return Response.json({ error: "Failed to fetch transmission lines" }, { status: 500 });
  }
}
