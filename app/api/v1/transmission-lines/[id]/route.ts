/**
 * GET /api/v1/transmission-lines/:id
 *
 * Fetch a single transmission line by ID. Returns 404 if not found.
 * Data source is controlled by NEXT_PUBLIC_FF_DB_TRANSMISSION.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // JSON mode
    if (getDataSource("transmissionLines") === "json") {
      const data = (await import("@/data/transmission-lines.json")).default;

      const line = data.find(
        (t: Record<string, unknown>) => String(t.id) === id
      );

      if (!line) {
        return NextResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: `Transmission line '${id}' not found`,
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json({ data: line });
    }

    // DB mode (placeholder)
    return NextResponse.json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "Database not configured for transmission lines",
        },
      },
      { status: 503 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: String(error),
        },
      },
      { status: 500 }
    );
  }
}
