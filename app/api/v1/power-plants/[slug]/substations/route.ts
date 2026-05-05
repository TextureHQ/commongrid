/**
 * GET /api/v1/power-plants/[slug]/substations
 *
 * List substations connected to a specific power plant (interconnection points).
 * Uses the power_plant_interconnections join table to find nearest substations.
 */

import { neon } from "@neondatabase/serverless";
import { notFound } from "next/navigation";

interface InterconnectionResult {
  substationId: string;
  substationName: string;
  substationType: string;
  voltageClass: string;
  owner: string;
  distanceKm: number;
  isPrimary: boolean;
}

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return Response.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const sql = neon(databaseUrl);

    // 1. Find power plant by slug
    const plantResult = await sql`
      SELECT id FROM power_plants
      WHERE slug = ${slug} AND deleted_at IS NULL
      LIMIT 1
    `;

    if (plantResult.length === 0) {
      return notFound();
    }

    const plantId = (plantResult[0] as { id: string }).id;

    // 2. Fetch interconnected substations via join table
    const substations = await sql<InterconnectionResult[]>`
      SELECT
        s.id as "substationId",
        s.name as "substationName",
        s.substation_type as "substationType",
        s.voltage_class as "voltageClass",
        s.owner_name as "owner",
        (ppi.distance_meters / 1000.0) as "distanceKm",
        ppi.is_primary as "isPrimary"
      FROM power_plant_interconnections ppi
      JOIN substations s ON ppi.substation_id = s.id
      WHERE
        ppi.power_plant_id = ${plantId}
        AND s.deleted_at IS NULL
      ORDER BY ppi.is_primary DESC, ppi.distance_meters ASC
    `;

    // 3. Separate primary from secondaries
    const primary = substations.find((s) => s.isPrimary);
    const secondaries = substations.filter((s) => !s.isPrimary);

    return Response.json(
      {
        power_plant_id: plantId,
        primary_interconnection: primary || null,
        secondary_interconnections: secondaries,
        total_candidate_substations: substations.length,
        distance_range_km: {
          min: substations.length > 0 ? Math.min(...substations.map((s) => s.distanceKm)) : null,
          max: substations.length > 0 ? Math.max(...substations.map((s) => s.distanceKm)) : null,
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
    console.error("Error fetching substations for power plant:", error);
    return Response.json(
      { error: "Failed to fetch interconnected substations" },
      { status: 500 }
    );
  }
}
