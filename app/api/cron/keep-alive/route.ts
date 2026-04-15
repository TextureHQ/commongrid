import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Keep-alive cron endpoint for Neon Postgres.
 * Prevents cold start latency by pinging the database every 4 minutes
 * during business hours (Mon-Fri 8am-10pm UTC).
 *
 * Spec ref: Section 2.2
 */
export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return NextResponse.json(
      { status: "skipped", reason: "DATABASE_URL not configured" },
      { status: 200 }
    );
  }

  try {
    // Use Neon serverless driver directly for minimal overhead
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(databaseUrl);
    const start = Date.now();
    await sql`SELECT 1`;
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "ok",
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Keep-alive ping failed:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
