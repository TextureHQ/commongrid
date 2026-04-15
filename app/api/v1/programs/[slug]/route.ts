/**
 * GET /api/v1/programs/:slug
 *
 * Fetch a single program by slug or ID. Returns 404 if not found.
 * Data source is controlled by NEXT_PUBLIC_FF_DB_PROGRAMS.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // JSON mode
    if (getDataSource("programs") === "json") {
      const data = (await import("@/data/programs.json")).default;

      const program = data.find(
        (p: Record<string, unknown>) => p.slug === slug || p.id === slug
      );

      if (!program) {
        return NextResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: `Program '${slug}' not found`,
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json({ data: program });
    }

    // DB mode (placeholder)
    return NextResponse.json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "Database not configured for programs",
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
