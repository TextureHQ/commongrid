/**
 * GET /api/v1/transmission-lines
 *
 * List transmission lines with filtering and pagination.
 * Data source is controlled by NEXT_PUBLIC_FF_DB_TRANSMISSION.
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
    const voltageClass = searchParams.get("voltageClass") || "";
    const owner = searchParams.get("owner") || "";
    const status = searchParams.get("status") || "";
    const minVoltage = searchParams.get("minVoltage")
      ? Number(searchParams.get("minVoltage"))
      : null;
    const maxVoltage = searchParams.get("maxVoltage")
      ? Number(searchParams.get("maxVoltage"))
      : null;

    // JSON mode
    if (getDataSource("transmissionLines") === "json") {
      const data = (await import("@/data/transmission-lines.json")).default;
      let filtered = [...data];

      // Search filter — match on owner
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (t: Record<string, unknown>) =>
            typeof t.owner === "string" && t.owner.toLowerCase().includes(q)
        );
      }

      // Voltage class filter
      if (voltageClass) {
        const vc = voltageClass.toLowerCase();
        filtered = filtered.filter(
          (t: Record<string, unknown>) =>
            typeof t.voltageClass === "string" &&
            t.voltageClass.toLowerCase() === vc
        );
      }

      // Owner filter (contains match)
      if (owner) {
        const o = owner.toLowerCase();
        filtered = filtered.filter(
          (t: Record<string, unknown>) =>
            typeof t.owner === "string" && t.owner.toLowerCase().includes(o)
        );
      }

      // Status filter
      if (status) {
        const s = status.toUpperCase();
        filtered = filtered.filter(
          (t: Record<string, unknown>) =>
            typeof t.status === "string" && t.status.toUpperCase() === s
        );
      }

      // Voltage range filters
      if (minVoltage !== null) {
        filtered = filtered.filter(
          (t: Record<string, unknown>) =>
            typeof t.voltage === "number" && t.voltage >= minVoltage
        );
      }
      if (maxVoltage !== null) {
        filtered = filtered.filter(
          (t: Record<string, unknown>) =>
            typeof t.voltage === "number" && t.voltage <= maxVoltage
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
