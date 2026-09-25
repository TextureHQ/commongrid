import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const cli = path.join(root, "node_modules/tsx/dist/cli.mjs");
const script = path.join(root, "scripts/sync-urdb.ts");
const env = { ...process.env };
delete env.DATABASE_URL;

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cli, "--tsconfig", path.join(root, "tsconfig.json"), script, ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("URDB CLI", () => {
  it("validates a gzip file without a database and emits attribution/hash, not invented coverage", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "urdb-test-"));
    try {
      const file = path.join(dir, "sample.json.gz");
      writeFileSync(
        file,
        gzipSync(JSON.stringify([{ label: "synthetic", name: "Synthetic rate", utility: "Example", eiaid: 1 }]))
      );
      const result = run(["--file", file], dir);
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(readFileSync(path.join(dir, "urdb-sync-report.json"), "utf8"));
      expect(report.mode).toBe("dry-run");
      expect(report.coverage).toEqual({ total: 1, matching: "not evaluated without DATABASE_URL" });
      expect(report.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(report.attribution.license).toBe("CC BY 4.0");
      expect(report.batches).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([["--apply"], ["--file"], ["--unknown"]])(
    "fails on missing credentials/arguments instead of silently succeeding",
    (...args) => {
      const dir = mkdtempSync(path.join(tmpdir(), "urdb-test-"));
      try {
        expect(run(args, dir).status).toBe(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});

describe("URDB deployment contract", () => {
  it("uses protected main-only DB-native workflow, no direct publishing, and existing failure alert", () => {
    const workflow = readFileSync(path.join(root, ".github/workflows/sync-urdb.yml"), "utf8");
    expect(workflow).toContain("environment: commongrid-data-sync");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("cron: '0 9 * * 2'");
    expect(workflow).toContain("scripts/sync-urdb.ts --apply");
    expect(workflow).not.toContain("git push");
    expect(readFileSync(path.join(root, ".github/workflows/sync-failure-alert.yml"), "utf8")).toContain(
      "- Sync URDB Tariffs"
    );
  });

  it("registers the source and gives the existing sync role only the new table permissions", () => {
    const sql = readFileSync(path.join(root, "drizzle/0032_urdb_tariffs.sql"), "utf8");
    expect(sql).toContain("'openei-urdb'");
    expect(sql).toContain("'CC-BY-4.0'");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON public.tariffs TO commongrid_sync");
    expect(sql).not.toContain("ALL TABLES");
    expect(sql).not.toContain("CREATE ROLE");
  });
});
