/**
 * Backfill existing Postgres users into Knock.
 *
 * Users created before the Knock integration shipped were never identified
 * into Knock, so they cannot receive notifications. This script pages through
 * every Postgres user and calls the idempotent identifyKnockUser() for each
 * user that has an email address.
 *
 *   npm run knock:backfill-users                # dry run, counts only
 *   npm run knock:backfill-users -- --apply     # identify users in Knock
 *
 * The script is read-only against Postgres. It only writes to Knock when
 * --apply is passed.
 */

import { asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { users } from "@/lib/db/schema";
import { identifyKnockUser, isKnockConfigured } from "@/lib/knock";

const BATCH_SIZE = 500;

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

function hostOf(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).hostname || null;
  } catch {
    return null;
  }
}

async function* userPages(db: ReturnType<typeof drizzle>) {
  let after = "";
  for (;;) {
    const rows = await db
      .select()
      .from(users)
      .where(after ? sql`${users.id} > ${after}` : undefined)
      .orderBy(asc(users.id))
      .limit(BATCH_SIZE);

    if (rows.length === 0) return;
    yield rows;
    after = rows[rows.length - 1].id;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const explicitDryRun = process.argv.includes("--dry-run");
  const dryRun = explicitDryRun || !apply;
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  if (!dryRun && !isKnockConfigured()) {
    console.error("KNOCK_API_KEY is not set. Refusing to identify users without a configured Knock client.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const db = drizzle(client);

  console.log(`database : ${hostOf(databaseUrl) ?? "?"}`);
  console.log(`mode     : ${dryRun ? "DRY RUN" : "APPLY"}\n`);

  let identified = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for await (const page of userPages(db)) {
      for (const user of page) {
        const email = user.email?.trim();
        if (!email) {
          skipped++;
          console.log(`[skip] ${user.id}: no email (role=${user.role})`);
          continue;
        }

        if (dryRun) {
          identified++;
          console.log(`[dry-run] would identify ${user.id} (${maskEmail(email)}) [${user.role}]`);
          continue;
        }

        try {
          await identifyKnockUser(user);
          identified++;
          console.log(`[identify] ${user.id} (${maskEmail(email)}) [${user.role}]`);
        } catch (err) {
          failed++;
          console.error(`[fail] ${user.id} (${maskEmail(email)}):`, err);
        }
      }
    }

    console.log("\nSummary:");
    console.log(`  identified : ${identified}`);
    console.log(`  skipped    : ${skipped}`);
    console.log(`  failed     : ${failed}`);

    if (dryRun) {
      console.log("\nDry run. Re-run with --apply to identify users in Knock.");
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
