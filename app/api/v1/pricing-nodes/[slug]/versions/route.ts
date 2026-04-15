import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/feature-flags";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Version history only available in database mode
    if (getDataSource("pricingNodes") === "json") {
      return NextResponse.json({
        data: [],
        message: "Version history not available in JSON mode",
        entitySlug: slug,
      });
    }

    // Database mode — query entity_versions
    const { db } = await import("@/lib/db/client");
    if (!db) {
      return NextResponse.json(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Database not configured" } },
        { status: 503 }
      );
    }

    const { sql } = await import("drizzle-orm");
    const rows = await db.execute(sql`
      SELECT version_number, change_type, change_summary, changed_by, changed_at
      FROM entity_versions
      WHERE entity_type = 'pricing_node' AND entity_id = ${slug}
      ORDER BY version_number DESC
      LIMIT 50
    `);

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("Error fetching pricing node versions:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
      { status: 500 }
    );
  }
}
