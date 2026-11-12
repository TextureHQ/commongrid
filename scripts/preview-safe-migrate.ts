/**
 * Build-time wrapper around `drizzle-kit migrate` that tolerates the Neon↔Vercel
 * first-build race.
 *
 * On a brand-new branch, Vercel starts the build before the Neon integration has
 * finished forking the database and injecting the branch-scoped
 * `DATABASE_URL`/`DATABASE_URL_UNPOOLED`. The first build therefore runs
 * `db:migrate` with the URL still unset, drizzle-kit aborts
 * ("Please provide required params for Postgres driver: url: undefined"), and the
 * deployment goes red. Seconds later the integration injects the env and triggers
 * a fresh redeploy that migrates successfully — so the red build is a transient
 * artifact of the race, not a real failure.
 *
 * This wrapper makes that first preview build a clean no-op when the DB env is not
 * yet present, letting the Neon-triggered redeploy run the real migration. It only
 * ever skips on preview builds; anywhere else a missing URL is a hard failure so
 * production migrations still fail loud.
 *
 * Mirrors the `--only-preview` guard already used by scripts/seed-clerk-ids.ts.
 */
import { spawnSync } from "node:child_process";

/** The DB envs drizzle.config.ts reads, in the same precedence order. */
function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  return url && url.trim().length > 0 ? url : undefined;
}

function isPreviewBuild(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

function runDrizzleMigrate(): number {
  const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(`db:migrate — failed to spawn drizzle-kit: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function main(): number {
  const databaseUrl = resolveDatabaseUrl();

  if (databaseUrl) {
    return runDrizzleMigrate();
  }

  // No DB URL. On a preview build this is the Neon first-build race: skip cleanly
  // and let the env-injected redeploy run the migration.
  if (isPreviewBuild()) {
    console.log(
      "db:migrate — skipped: no DATABASE_URL yet on this preview build. " +
        "The Neon integration injects the branch-scoped database env and triggers a " +
        "redeploy that runs the real migration. This is expected on the first build of a new branch."
    );
    return 0;
  }

  // Anywhere else (production, local, CI) a missing DB URL is a real failure.
  console.error(
    "db:migrate — DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set and this is not a preview build " +
      `(VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}). Refusing to skip migrations.`
  );
  return 1;
}

process.exit(main());
