/**
 * Point existing `users` rows at development-instance Clerk IDs.
 *
 * Preview and development deployments authenticate against Clerk's DEVELOPMENT
 * instance, but their database is a copy-on-write fork of production and so
 * holds PRODUCTION Clerk IDs. Clerk cannot transfer user data between
 * instances, so the IDs never line up: you sign in successfully, then
 * `getCurrentUser()` finds no row and every write path 401s.
 *
 * This matches on email — the one identifier stable across both instances —
 * and rewrites `users.clerk_user_id` to the development ID.
 *
 * It creates nothing. Users must already exist in the development instance;
 * rows with no match are left alone and reported.
 *
 * Preview branches are forked per git branch, so this needs re-running when a
 * new branch's database is created.
 *
 *   npm run db:seed:clerk:dev            # dry run, prints the plan
 *   npm run db:seed:clerk:dev -- --apply # write
 *
 * REFUSES TO TOUCH PRODUCTION. See the guards below.
 */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { users } from "@/lib/db/schema";

/**
 * Database hosts this script must never write to — the production endpoint,
 * comma-separated if more than one.
 *
 * Kept out of the repo because this one is public, and naming the production
 * endpoint hands anyone the exact host to aim at.
 *
 * Must be set in TWO places: `.env.local` for local runs, AND in Vercel for
 * every environment — `.env.local` is not read by Vercel, so without the Vercel
 * variable the script refuses to run there, including from the build.
 *
 * Crucially this FAILS CLOSED: if the variable is missing the script refuses to
 * run at all. An unset variable disables the script, never the guard. Match is
 * on the endpoint id, so it covers both the pooled and direct hostnames.
 */
const PROTECTED_DB_HOSTS = (process.env.PROTECTED_DB_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const CLERK_API = "https://api.clerk.com/v1";

/**
 * Emails and Clerk ids are masked by default because this runs inside the
 * Vercel build and its output lands in build logs on every preview deploy.
 * `--verbose` prints them in full for local debugging.
 */
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

/**
 * Host of a connection string, or null when it cannot be parsed. Callers must
 * treat null as a refusal: a guard that cannot read the host is a guard that
 * is not guarding.
 */
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

/**
 * Every guard is independent, and any one of them failing aborts. The first is
 * the important one: a development Clerk instance is the only source of IDs
 * this script can legitimately write, so a live key means it is pointed
 * somewhere it should not be — regardless of what the database says.
 */
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

  // For use inside the Vercel build, where a non-preview environment must be a
  // no-op rather than a failure. Run by hand the guards stay loud; with this
  // flag anything that is not a preview exits 0 without touching the database.
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
    // Ordered so that when one address has several rows, the same one claims
    // the development id on every run. Which row that is remains arbitrary —
    // the point is that it does not change between builds.
    const rows = await db
      .select({ id: users.id, email: users.email, role: users.role, clerkUserId: users.clerkUserId })
      .from(users)
      .orderBy(users.id);

    // `users.clerk_user_id` is UNIQUE but `email` is not, and production
    // already contains two rows for the same address — one per Clerk instance.
    // Remapping a row onto an id another row already holds would violate that
    // constraint, so those are reported rather than attempted.
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
        // Claim the target immediately. Two rows can share an address, and if
        // neither currently holds the development id both would otherwise plan
        // onto it — the second update then violates the unique constraint.
        // Reporting the second as blocked surfaces the "which row gets the
        // role" question instead of letting whichever row sorts first win it.
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

    // One transaction so a constraint violation mid-loop cannot leave the table
    // half-remapped — some rows on development ids, the rest on production ones.
    await db.transaction(async (tx) => {
      for (const p of planned) {
        // Keyed on the primary key, not the email: `users.email` has no unique
        // constraint and production already holds two rows for the same address,
        // one per Clerk instance. Matching on email would update both.
        await tx.update(users).set({ clerkUserId: p.to, updatedAt: sql`now()` }).where(eq(users.id, p.rowId));
      }
    });
    console.log(`\nUpdated ${planned.length} row(s).`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  // Guard refusals call process.exit(1) directly and never reach here — a
  // misconfigured script is always fatal. This handles post-guard failure only:
  // a Clerk outage, a dropped connection. Inside a build that is a convenience
  // that did not happen, not a reason to fail an otherwise good deploy.
  const bestEffort = process.argv.includes("--only-preview");
  console.error(bestEffort ? "warning: Clerk id mapping skipped —" : "failed:", e);
  process.exit(bestEffort ? 0 : 1);
});
