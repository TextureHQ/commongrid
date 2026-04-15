/**
 * GET /api/v1/programs
 *
 * List programs with filtering and pagination.
 * Data source is controlled by NEXT_PUBLIC_FF_DB_PROGRAMS.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || "50"), 1),
      200
    );
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    // JSON mode
    if (getDataSource("programs") === "json") {
      const data = (await import("@/data/programs.json")).default;
      let filtered = [...data];

      // Search filter — match on name and description
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (p: Record<string, unknown>) =>
            (typeof p.name === "string" &&
              p.name.toLowerCase().includes(q)) ||
            (typeof p.description === "string" &&
              p.description.toLowerCase().includes(q))
        );
      }

      // Status filter
      if (status) {
        const s = status.toUpperCase();
        filtered = filtered.filter(
          (p: Record<string, unknown>) =>
            typeof p.status === "string" && p.status.toUpperCase() === s
        );
      }

      const total = filtered.length;
      const page = filtered.slice(0, limit);

      return NextResponse.json({
        data: page,
        pagination: {
          cursor: null,
          limit,
          total,
          hasMore: total > limit,
        },
      });
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
