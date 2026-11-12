import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const WRAPPER = path.resolve(process.cwd(), "scripts/preview-safe-migrate.ts");

/**
 * Run the wrapper with a controlled env. We point drizzle-kit at a URL that will
 * never connect so the "ran migrate" path is observable without a real database:
 * drizzle-kit is spawned and fails, so a non-zero exit with drizzle output proves
 * we did NOT skip. The skip paths exit 0 before spawning anything.
 */
function runWrapper(env: Record<string, string | undefined>): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  // Clear the DB envs first so the host environment never leaks in.
  delete childEnv.DATABASE_URL;
  delete childEnv.DATABASE_URL_UNPOOLED;
  delete childEnv.VERCEL_ENV;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }

  try {
    const stdout = execFileSync("npx", ["tsx", WRAPPER], {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: childEnv,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("preview-safe-migrate", () => {
  it("skips cleanly on a preview build with no DATABASE_URL (Neon first-build race)", () => {
    const { status, stdout } = runWrapper({ VERCEL_ENV: "preview" });
    expect(status).toBe(0);
    expect(stdout).toContain("db:migrate — skipped");
    expect(stdout).toContain("preview build");
  });

  it("fails loud when DATABASE_URL is missing and it is NOT a preview build", () => {
    const { status, stderr } = runWrapper({ VERCEL_ENV: "production" });
    expect(status).toBe(1);
    expect(stderr).toContain("Refusing to skip migrations");
  });

  it("fails loud when DATABASE_URL is missing and VERCEL_ENV is unset (local/CI)", () => {
    const { status, stderr } = runWrapper({});
    expect(status).toBe(1);
    expect(stderr).toContain("Refusing to skip migrations");
    expect(stderr).toContain("VERCEL_ENV=unset");
  });

  it("treats an empty-string DATABASE_URL as unset", () => {
    const { status, stdout } = runWrapper({ VERCEL_ENV: "preview", DATABASE_URL: "   " });
    expect(status).toBe(0);
    expect(stdout).toContain("db:migrate — skipped");
  });

  it("runs the real drizzle-kit migrate when a DATABASE_URL is present", () => {
    // Unreachable host → drizzle-kit is invoked and fails to connect. A non-zero
    // exit without the skip message proves we took the migrate path, not the skip.
    const { status, stdout } = runWrapper({
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgresql://user:pass@127.0.0.1:1/doesnotexist",
    });
    expect(stdout).not.toContain("db:migrate — skipped");
    expect(status).not.toBe(0);
  });

  it("prefers DATABASE_URL_UNPOOLED over DATABASE_URL, same as drizzle.config.ts", () => {
    const { stdout } = runWrapper({
      VERCEL_ENV: "preview",
      DATABASE_URL_UNPOOLED: "postgresql://user:pass@127.0.0.1:1/doesnotexist",
    });
    // Present URL → did not skip.
    expect(stdout).not.toContain("db:migrate — skipped");
  });
});
