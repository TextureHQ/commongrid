import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the CIR-1271 class of bug: a scheduled workflow referencing a
 * script or binary that does not exist on the runner. These failures are
 * invisible in PR CI because nothing runs the cron path, so they are asserted
 * statically here instead.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");
const WORKFLOW_DIR = path.join(REPO_ROOT, ".github/workflows");

const syncWorkflows = fs
  .readdirSync(WORKFLOW_DIR)
  .filter((f) => f.startsWith("sync-") && f.endsWith(".yml"))
  .map((f) => path.join(WORKFLOW_DIR, f));

function workflowText(file: string): string {
  return fs.readFileSync(file, "utf-8");
}

describe("scheduled sync workflows", () => {
  it("finds the sync workflows to check", () => {
    expect(syncWorkflows.length).toBeGreaterThanOrEqual(5);
  });

  it.each(syncWorkflows)("%s only invokes scripts that exist", (file) => {
    const text = workflowText(file);
    // Matches `node scripts/x.mjs`, `npx tsx scripts/x.ts`, `bash scripts/x.sh`.
    const refs = [...text.matchAll(/(?:node|npx tsx|tsx|bash)\s+(scripts\/[\w./-]+\.(?:mjs|ts|js|sh))/g)].map(
      (m) => m[1]
    );

    const missing = refs.filter((rel) => !fs.existsSync(path.join(REPO_ROOT, rel)));
    expect(missing, `${path.basename(file)} references missing script(s)`).toEqual([]);
  });

  it.each(syncWorkflows)("%s does not git add paths no workflow produces", (file) => {
    const text = workflowText(file);
    // public/data/*.json was deleted when list pages moved to server-driven
    // hooks; staging it again would reintroduce the MODULE_NOT_FOUND-era paths.
    expect(text).not.toMatch(/git add[^\n]*public\/data\/(?!territories)/);
  });
});

describe("build-tiles.sh", () => {
  const script = path.join(REPO_ROOT, "scripts/build-tiles.sh");
  const text = fs.readFileSync(script, "utf-8");

  it("is valid bash", () => {
    expect(() => execFileSync("bash", ["-n", script])).not.toThrow();
  });

  it("guards the optional pmtiles CLI before using it", () => {
    // A bare `pmtiles show` at the end aborted the script with exit 127 after
    // every tile had already been built, on every workflow that does not
    // install the CLI (CIR-1271). Comments are stripped so prose describing the
    // old bug does not satisfy or defeat the assertion.
    const code = text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");

    const guardIndex = code.indexOf("command -v pmtiles");
    const firstShow = code.indexOf("pmtiles show");

    expect(guardIndex, "expected a `command -v pmtiles` availability check").toBeGreaterThan(-1);
    expect(firstShow, "expected `pmtiles show` to run only after the guard").toBeGreaterThan(guardIndex);
  });

  it("still fails loudly when a required tile archive is missing", () => {
    expect(text).toMatch(/territories\.pmtiles is missing or empty|Expected tile archive/);
  });
});
