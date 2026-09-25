/** URDB → database-native version history. No writes unless --apply is explicit. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { isNull } from "drizzle-orm";
import { getPooledDb } from "@/lib/db/client-pooled";
import { utilities } from "@/lib/db/schema";
import { applySync } from "@/lib/sync/apply-sync";
import { parseUrdb, toTariffSyncRecords, URDB_ATTRIBUTION, URDB_DOWNLOAD_URL } from "@/lib/sync/urdb";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const fileIndex = args.indexOf("--file");
  const file = fileIndex >= 0 ? args[fileIndex + 1] : undefined;
  if (fileIndex >= 0 && (!file || file.startsWith("--"))) throw new Error("--file requires a path");
  if (args.some((arg, i) => !["--apply", "--file"].includes(arg) && !(fileIndex >= 0 && i === fileIndex + 1))) {
    throw new Error("Usage: sync-urdb.ts [--apply] [--file path.json[.gz]]");
  }
  if (apply && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for --apply");
  const downloadedAt = new Date().toISOString();
  const bytes = file ? await readFile(file) : await download();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // gzip magic, not HTTP headers: fetch may already have decompressed the response.
  const json =
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 }).toString("utf8")
      : bytes.toString("utf8");
  const rows = parseUrdb(json);
  // Read-only dry-runs may use the real registry, otherwise report coverage as unknown.
  const registry = process.env.DATABASE_URL
    ? await getPooledDb()
        .select({ id: utilities.id, eiaId: utilities.eiaId })
        .from(utilities)
        .where(isNull(utilities.deletedAt))
    : [];
  const { records, coverage } = toTariffSyncRecords(rows, registry);
  const report = {
    mode: apply ? "apply" : "dry-run",
    downloadedAt,
    sha256,
    input: file ? "local-file" : URDB_DOWNLOAD_URL,
    attribution: URDB_ATTRIBUTION,
    coverage: process.env.DATABASE_URL
      ? coverage
      : { total: rows.length, matching: "not evaluated without DATABASE_URL" },
    batches: [] as Array<{
      batchId: string | null;
      created: number;
      updated: number;
      unchanged: number;
      deferredFields: number;
    }>,
  };
  // Preflight ALL records before the first write. Bounded transactions avoid a
  // national import holding a single transaction for hours. Re-runs resume safely.
  for (let offset = 0; apply && offset < records.length; offset += 250) {
    const result = await applySync(records.slice(offset, offset + 250), {
      entityType: "tariff",
      initiatedBy: "sync:openei-urdb",
      batchTitle: `URDB tariff sync · records ${offset + 1}–${Math.min(offset + 250, records.length)}`,
      batchDescription: JSON.stringify({
        downloadedAt,
        sha256,
        source: URDB_DOWNLOAD_URL,
        attribution: URDB_ATTRIBUTION,
      }),
    });
    report.batches.push({
      batchId: result.batchId,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      deferredFields: result.deferrals.length,
    });
    // Persist partial progress too: completed chunks remain valid if a later chunk fails.
    await writeFile("urdb-sync-report.json", `${JSON.stringify(report, null, 2)}\n`);
  }
  await writeFile("urdb-sync-report.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

async function download(): Promise<Buffer> {
  const response = await fetch(URDB_DOWNLOAD_URL, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`URDB download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 128 * 1024 * 1024) throw new Error("URDB compressed download exceeds 128 MiB safety limit");
  return bytes;
}

main()
  .then(() => process.exit(0))
  .catch(() => {
    // Driver errors can contain connection details; never print credentials or raw errors.
    console.error(
      "URDB sync failed. Check source availability, input validation, and database migrations/permissions. Completed chunks are in urdb-sync-report.json; reruns are idempotent."
    );
    process.exit(1);
  });
