export async function GET() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Keep-alive cron triggered`);

  if (!process.env.DATABASE_URL) {
    console.log(`[${timestamp}] Skipped: No database configured`);
    return Response.json({ status: "skipped", reason: "No database configured" });
  }

  const start = Date.now();

  try {
    // Dynamic import so this compiles even if lib/db/client.ts doesn't exist yet
    let sql: ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) | null = null;

    try {
      const { neon } = await import("@neondatabase/serverless");
      sql = neon(process.env.DATABASE_URL);
    } catch (err) {
      console.error(`[${timestamp}] Database client unavailable:`, err);
      return Response.json({ status: "error", error: "Database client unavailable" }, { status: 503 });
    }

    await sql`SELECT 1`;
    const latencyMs = Date.now() - start;

    console.log(`[${timestamp}] Keep-alive successful - latency: ${latencyMs}ms`);
    return Response.json({ status: "ok", latencyMs, timestamp });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${timestamp}] Keep-alive failed:`, message);
    return Response.json({ status: "error", error: message, timestamp }, { status: 503 });
  }
}
