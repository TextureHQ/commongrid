/**
 * Point existing `users` rows at development-instance Clerk IDs.
 *
 * Previews authenticate against Clerk's development instance, but their
 * database is forked from production and holds production Clerk IDs. Clerk
 * cannot transfer users between instances, so the IDs never line up: sign-in
 * succeeds, then `getCurrentUser()` finds no row and writes 401.
 *
 * Matches on email and rewrites `users.clerk_user_id`. Creates nothing;
 * unmatched rows are reported. Needs re-running per preview branch.
 *
 *   npm run db:seed:clerk:dev            # dry run, prints the plan
 *   npm run db:seed:clerk:dev -- --apply # write
 */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { users } from "@/lib/db/schema";

/**
 * Database hosts this script must never write to — the production endpoint,
 * comma-separated if more than one.
 */
const PROTECTED_DB_HOSTS = (process.env.PROTECTED_DB_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const CLERK_API = "https://api.clerk.com/v1";

/** Verbose logging for local debugging. */
const VERBOSE = process.argv.includes("--verbose");

function maskEmail(email: string): string {
  if (VERBOSE) return email;
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

function maskId(id: string | null): string {
  if (!id) return "(none)";
  return VERBOSE ? id : `${id.slice(0, 9)}…`;
}

/** Host of a connection string, or null when it cannot be parsed. */
function hostOf(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).hostname || null;
  } catch {
    return null;
  }
}

interface ClerkUser {
  id: string;
  email_addresses: Array<{ id: string; email_address: string }>;
  primary_email_address_id: string | null;
}

/** Any one failure aborts. Runs before a database connection is opened. */
function assertNotProduction(databaseUrl: string, clerkSecret: string): void {
  const failures: string[] = [];

  if (PROTECTED_DB_HOSTS.length === 0) {
    failures.push(
      "PROTECTED_DB_HOSTS is not set. Refusing to run without knowing which host to protect — " +
        "set it to the production endpoint id in .env.local."
    );
  }

  if (!clerkSecret.startsWith("sk_test_")) {
    failures.push(
      `CLERK_SECRET_KEY is not a development key (expected sk_test_, got ${clerkSecret.slice(0, 8)}…). ` +
        "This script only ever writes development-instance IDs."
    );
  }

  if (process.env.VERCEL_ENV === "production") {
    failures.push("VERCEL_ENV is 'production'.");
  }

  const host = hostOf(databaseUrl);
  if (host === null) {
    failures.push("DATABASE_URL could not be parsed, so its host cannot be checked against PROTECTED_DB_HOSTS.");
  } else {
    for (const protectedHost of PROTECTED_DB_HOSTS) {
      if (host.includes(protectedHost)) {
        failures.push(`DATABASE_URL points at a protected host (${host}).`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("\nREFUSING TO RUN\n");
    for (const f of failures) console.error(`  - ${f}`);
    console.error("");
    process.exit(1);
  }
}

async function fetchDevClerkUsers(secret: string): Promise<ClerkUser[]> {
  const res = await fetch(`${CLERK_API}/users?limit=500`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    throw new Error(`Clerk API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as ClerkUser[] | { data: ClerkUser[] };
  return Array.isArray(body) ? body : body.data;
}

function primaryEmail(u: ClerkUser): string | null {
  const match = u.email_addresses.find((e) => e.id === u.primary_email_address_id) ?? u.email_addresses[0];
  return match?.email_address?.toLowerCase() ?? null;
}

async function main() {
  const apply = process.argv.includes("--apply");

  // For the Vercel build, where a non-preview environment must be a no-op
  // rather than a failure.
  if (process.argv.includes("--only-preview") && process.env.VERCEL_ENV !== "preview") {
    console.log(`db:seed:clerk:dev — skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}, not a preview)`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const clerkSecret = process.env.CLERK_SECRET_KEY;

  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!clerkSecret) {
    console.error("CLERK_SECRET_KEY is not set. Run `clerk env pull` to fetch development keys.");
    process.exit(1);
  }

  assertNotProduction(databaseUrl, clerkSecret);

  console.log(`database    : ${hostOf(databaseUrl) ?? "?"}`);
  console.log(`clerk       : development (${clerkSecret.slice(0, 12)}…)`);
  console.log(`mode        : ${apply ? "APPLY" : "dry run"}\n`);

  const clerkUsers = await fetchDevClerkUsers(clerkSecret);
  const byEmail = new Map<string, ClerkUser>();
  for (const u of clerkUsers) {
    const email = primaryEmail(u);
    if (email) byEmail.set(email, u);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const db = drizzle(client);

  try {
    // Stable order, so the same row claims the id on every run.
    const rows = await db
      .select({ id: users.id, email: users.email, role: users.role, clerkUserId: users.clerkUserId })
      .from(users)
      .orderBy(users.id);

    // `clerk_user_id` is UNIQUE but `email` is not, so one address can hold a
    // row per Clerk instance. Rows targeting a taken id are reported, not moved.
    const takenIds = new Set(rows.map((r) => r.clerkUserId));

    const planned: Array<{ rowId: string; email: string; from: string; to: string; role: string }> = [];
    const alreadyMapped: string[] = [];
    const blocked: Array<{ email: string; role: string; to: string }> = [];

    for (const row of rows) {
      const email = row.email?.toLowerCase();
      if (!email) continue;
      const clerkUser = byEmail.get(email);
      if (!clerkUser) continue;

      if (row.clerkUserId === clerkUser.id) {
        alreadyMapped.push(email);
      } else if (takenIds.has(clerkUser.id)) {
        blocked.push({ email, role: row.role, to: clerkUser.id });
      } else {
        planned.push({ rowId: row.id, email, from: row.clerkUserId, to: clerkUser.id, role: row.role });
        // Claim it now, or a second row with the same address plans onto the
        // same id and the update violates the unique constraint.
        takenIds.add(clerkUser.id);
      }
    }

    const unmatchedClerk = [...byEmail.keys()].filter((e) => !rows.some((r) => r.email?.toLowerCase() === e));

    if (planned.length === 0) {
      console.log("Nothing to change.");
    } else {
      console.log(`Will remap ${planned.length} user(s):\n`);
      for (const p of planned) {
        console.log(`  ${maskEmail(p.email)}  [${p.role}]`);
        console.log(`    ${maskId(p.from)}  ->  ${maskId(p.to)}`);
      }
      console.log("");
    }

    if (alreadyMapped.length > 0) {
      console.log(`Already mapped: ${alreadyMapped.map(maskEmail).join(", ")}`);
    }

    if (blocked.length > 0) {
      console.log(`\nSkipped ${blocked.length} row(s) — another row already holds the target Clerk id:`);
      for (const b of blocked) {
        console.log(`  ${maskEmail(b.email)} [${b.role}] -> ${maskId(b.to)} (taken)`);
      }
      console.log("  This address has a row per Clerk instance. Check which one carries the role you need.");
    }
    if (unmatchedClerk.length > 0) {
      console.log(`In Clerk but not in this database: ${unmatchedClerk.map(maskEmail).join(", ")}`);
      console.log("  (they will sign in but resolve to no user — add a row, or ignore)");
    }

    if (!apply) {
      if (planned.length > 0) console.log("\nDry run. Re-run with --apply to write.");
      return;
    }

    // One transaction so a mid-loop failure cannot leave the table half-remapped.
    await db.transaction(async (tx) => {
      for (const p of planned) {
        // Keyed on the primary key — matching on email would update every
        // row sharing the address.
        await tx.update(users).set({ clerkUserId: p.to, updatedAt: sql`now()` }).where(eq(users.id, p.rowId));
      }
    });
    console.log(`\nUpdated ${planned.length} row(s).`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  // Guard refusals exit(1) directly and never reach here. This is post-guard
  // failure only — a Clerk outage should not fail an otherwise good deploy.
  const bestEffort = process.argv.includes("--only-preview");
  console.error(bestEffort ? "warning: Clerk id mapping skipped —" : "failed:", e);
  process.exit(bestEffort ? 0 : 1);
});
