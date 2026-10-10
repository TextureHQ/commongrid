import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const GUARD_SOURCE = path.resolve(process.cwd(), "scripts/check-sync-writers.ts");

describe("check-sync-writers guard", () => {
  it("passes on the current tree", () => {
    const result = execSync("npx tsx scripts/check-sync-writers.ts", {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
    expect(result).toContain("No raw contributable-table writes found");
  });

  it("flags a known-bad raw onConflictDoUpdate on a contributable table", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "check-sync-writers-"));
    const scriptsDir = path.join(tmpDir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });

    const badFile = path.join(scriptsDir, "sync-ev-charging.ts");
    fs.writeFileSync(
      badFile,
      `import { evStations } from "../lib/db/schema";\n` +
        `export async function bad() {\n` +
        `  await db.insert(evStations).values([]).onConflictDoUpdate({ target: evStations.id, set: {} });\n` +
        `}\n`
    );

    const guardPath = path.join(scriptsDir, "check-sync-writers.ts");
    fs.copyFileSync(GUARD_SOURCE, guardPath);

    let threw = false;
    try {
      execSync(`npx tsx ${guardPath}`, {
        cwd: tmpDir,
        encoding: "utf-8",
      });
    } catch (err) {
      threw = true;
      const stderr = (err as { stderr?: string }).stderr ?? "";
      expect(stderr).toContain("drizzle onConflictDoUpdate");
      expect(stderr).toContain("sync-ev-charging.ts");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    expect(threw).toBe(true);
  });

  it("allows allowlisted non-contributable writers", () => {
    // sync-substations.ts is allowlisted because substations are not
    // contributable. The guard must not flag it for its raw upsert.
    const result = execSync("npx tsx scripts/check-sync-writers.ts", {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
    expect(result).not.toContain("sync-substations.ts");
  });
});
