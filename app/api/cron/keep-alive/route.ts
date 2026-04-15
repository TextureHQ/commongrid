export async function GET() {
  if (!process.env.DATABASE_URL) {
    return Response.json({ status: 'skipped', reason: 'No database configured' });
  }

  const start = Date.now();

  try {
    // Dynamic import so this compiles even if lib/db/client.ts doesn't exist yet
    let sql: ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) | null = null;

    try {
      const { neon } = await import('@neondatabase/serverless');
      sql = neon(process.env.DATABASE_URL);
    } catch {
      return Response.json(
        { status: 'error', error: 'Database client unavailable' },
        { status: 503 },
      );
    }

    await sql`SELECT 1`;
    const latencyMs = Date.now() - start;

    return Response.json({ status: 'ok', latencyMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ status: 'error', error: message }, { status: 503 });
  }
}
