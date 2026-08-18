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

  it.each(syncWorkflows)("%s does not download release assets from a guessed /latest/download/ path", (file) => {
    const text = workflowText(file);
    // go-pmtiles (and most goreleaser projects) embed the version in the asset
    // filename, so `/releases/latest/download/<name-without-version>` 404s. Piped
    // into `tar -xz` under `curl -sL`, the 404 HTML surfaced as "gzip: stdin: not
    // in gzip format" and failed sync-pricing-nodes on every run (CIR-1271).
    // Comments are stripped so prose describing the old bug neither satisfies
    // nor trips the assertion.
    const code = text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    const badDownloads = [...code.matchAll(/releases\/latest\/download\/\S+/g)].map((m) => m[0]);
    expect(badDownloads, `${path.basename(file)} guesses a versioned release asset name`).toEqual([]);
  });
});

describe("sync-failure-alert.yml", () => {
  const alertFile = path.join(WORKFLOW_DIR, "sync-failure-alert.yml");
  const alertText = fs.readFileSync(alertFile, "utf-8");

  /** `name:` of every workflow that runs on a `schedule:` trigger. */
  function scheduledWorkflowNames(): string[] {
    return fs
      .readdirSync(WORKFLOW_DIR)
      .filter((f) => f.endsWith(".yml") && f !== "sync-failure-alert.yml")
      .map((f) => fs.readFileSync(path.join(WORKFLOW_DIR, f), "utf-8"))
      .filter((text) => /^\s*schedule:/m.test(text))
      .map((text) => text.match(/^name:\s*(.+)$/m)?.[1]?.trim())
      .filter((n): n is string => Boolean(n))
      .sort();
  }

  /** Workflow names listed under the alert's `workflow_run.workflows:` key. */
  function watchedWorkflowNames(): string[] {
    const block = alertText.match(/workflows:\n((?:\s*-\s*.+\n)+)/)?.[1] ?? "";
    return block
      .split("\n")
      .map((line) => line.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean)
      .sort();
  }

  it("watches every scheduled workflow by its exact name", () => {
    // GitHub silently ignores a workflow_run entry whose name matches no
    // workflow. "Sync Pricing Nodes" was listed while the workflow is actually
    // named "Sync Pricing Nodes Data", so its failures alerted nobody for the
    // entire time the alerting was believed to be in place (CIR-1271).
    const scheduled = scheduledWorkflowNames();
    const watched = watchedWorkflowNames();

    expect(scheduled.length).toBeGreaterThanOrEqual(5);

    const unwatched = scheduled.filter((n) => !watched.includes(n));
    expect(unwatched, "scheduled workflow(s) whose failures would alert nobody").toEqual([]);

    const dangling = watched.filter((n) => !scheduled.includes(n));
    expect(dangling, "watched name(s) matching no scheduled workflow (typo?)").toEqual([]);
  });

  it("only alerts on failed scheduled runs", () => {
    expect(alertText).toMatch(/conclusion == 'failure'/);
    expect(alertText).toMatch(/event == 'schedule'/);
  });

  it("can write issues and does not require a non-default secret to alert", () => {
    // The GITHUB_TOKEN path must work with no repo configuration, otherwise the
    // alerting is only theoretical until someone adds a secret (CIR-1271).
    expect(alertText).toMatch(/issues:\s*write/);
    expect(alertText).toMatch(/secrets\.GITHUB_TOKEN/);
    // The optional Slack step must be conditional so a missing webhook cannot
    // fail the alert job and re-silence the pipeline.
    expect(alertText).toMatch(/if:\s*env\.SLACK_WEBHOOK_URL != ''/);
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
