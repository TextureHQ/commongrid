import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(process.cwd(), "scripts/seed-clerk-ids.ts");

/**
 * Exercises only the build-time guard paths of seed-clerk-ids.ts — the ones that
 * decide whether to run at all — without needing a database or Clerk. We control
 * the env so the host environment never leaks in.
 */
function runSeed(
  args: string[],
  env: Record<string, string | undefined>
): { status: number; stdout: string; stderr: string } {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.DATABASE_URL;
  delete childEnv.DATABASE_URL_UNPOOLED;
  delete childEnv.VERCEL_ENV;
  delete childEnv.CLERK_SECRET_KEY;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }

  try {
    const stdout = execFileSync("npx", ["tsx", SCRIPT, ...args], {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: childEnv,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("seed-clerk-ids build-time guards", () => {
  it("skips (not a preview) when --only-preview and VERCEL_ENV is not preview", () => {
    const { status, stdout } = runSeed(["--only-preview", "--apply"], { VERCEL_ENV: "production" });
    expect(status).toBe(0);
    expect(stdout).toContain("not a preview");
  });

  it("skips cleanly on a preview build with no DATABASE_URL yet (Neon first-build race)", () => {
    const { status, stdout } = runSeed(["--only-preview", "--apply"], { VERCEL_ENV: "preview" });
    expect(status).toBe(0);
    expect(stdout).toContain("db:seed:clerk:dev — skipped");
    expect(stdout).toContain("no DATABASE_URL yet");
  });

  it("still fails loud on a missing DATABASE_URL when not a build (no --only-preview)", () => {
    const { status, stderr } = runSeed([], { VERCEL_ENV: "preview" });
    expect(status).toBe(1);
    expect(stderr).toContain("DATABASE_URL is not set");
  });
});
