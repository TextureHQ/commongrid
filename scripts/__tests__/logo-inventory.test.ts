import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inventoryLogos } from "../lib/logo-inventory";

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "logo-inventory-"));
  roots.push(root);
  await mkdir(path.join(root, "data"));
  await mkdir(path.join(root, "public/logos"), { recursive: true });
  for (const dataset of ["utilities", "isos", "rtos", "balancing-authorities"]) {
    await writeFile(path.join(root, `data/${dataset}.json`), "[]");
  }
  return root;
}
async function records(root: string, dataset: string, logos: (string | null)[]) {
  await writeFile(
    path.join(root, `data/${dataset}.json`),
    JSON.stringify(logos.map((logo, index) => ({ id: `id-${index}`, slug: `slug-${index}`, logo })))
  );
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("repository logo inventory", () => {
  it("hashes original bytes, counts shared assets across entity types, and preserves unknown provenance", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "public/logos/shared.png"), "unchanged bytes");
    await writeFile(path.join(root, "public/logos/copy.png"), "unchanged bytes");
    await records(root, "utilities", ["/logos/shared.png", null, "/logos/missing.png"]);
    await records(root, "isos", ["/logos/shared.png"]);
    const before = await readFile(path.join(root, "data/utilities.json"));
    const result = await inventoryLogos(root);
    expect(result.summary).toEqual({
      entities: 4,
      utilityEntities: 3,
      assets: 2,
      localReferences: 2,
      missingReferences: 1,
      absentReferences: 1,
      externalReferences: 0,
      unsupportedReferences: 0,
      unreferencedAssets: 1,
      sharedAssets: 1,
      duplicateContentGroups: 1,
    });
    expect(result.assets[1]).toMatchObject({
      publicPath: "/logos/shared.png",
      bytes: 15,
      sha256: createHash("sha256").update("unchanged bytes").digest("hex"),
      sourceUrl: null,
      usageNote: null,
      provenanceStatus: "needs-review",
      references: [
        { dataset: "isos", id: "id-0" },
        { dataset: "utilities", id: "id-0" },
      ],
    });
    expect(result.duplicateContent[0].paths).toEqual(["/logos/copy.png", "/logos/shared.png"]);
    expect(await inventoryLogos(root)).toEqual(result);
    expect(await readFile(path.join(root, "data/utilities.json"))).toEqual(before);
    expect(await readFile(path.join(root, "public/logos/shared.png"), "utf8")).toBe("unchanged bytes");
  });

  it("classifies URLs and unsafe paths without resolving or fetching them", async () => {
    const root = await fixture();
    await records(root, "utilities", [
      "https://example.com/logo.png",
      "http://example.com/logo.png",
      "/logos/../secret",
      "/logos/%2e%2e/secret",
      "/logos/a\\b.png",
      "/logos/a.png?x=1",
      "//example.com/a.png",
      "data:image/png;base64,abc",
      "file:///etc/passwd",
      "",
      "/logos//a.png",
    ]);
    const result = await inventoryLogos(root);
    expect(result.summary).toMatchObject({ externalReferences: 2, unsupportedReferences: 8, absentReferences: 1 });
    expect(result.assets).toEqual([]);
    expect(result.references.find((ref) => ref.id === "id-2")?.currentLogo).toBe("/logos/../secret");
  });

  it("fails closed on symlink assets instead of reading outside the logo tree", async () => {
    const root = await fixture();
    await symlink(path.join(root, "data/utilities.json"), path.join(root, "public/logos/escape.png"));
    await expect(inventoryLogos(root)).rejects.toThrow("Unsupported logo directory entry");
  });

  it("rejects malformed datasets rather than silently dropping records", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "data/utilities.json"), '[{"id":"a","slug":"a","logo":42}]');
    await expect(inventoryLogos(root)).rejects.toThrow();
  });
  it("includes nested files and remains deterministic when dataset order changes", async () => {
    const root = await fixture();
    await mkdir(path.join(root, "public/logos/nested"));
    await writeFile(path.join(root, "public/logos/nested/a.png"), "nested");
    await records(root, "utilities", ["/logos/nested/a.png", null]);
    const first = await inventoryLogos(root);
    const filename = path.join(root, "data/utilities.json");
    const rows = JSON.parse(await readFile(filename, "utf8"));
    await writeFile(filename, JSON.stringify(rows.reverse()));
    const second = await inventoryLogos(root);
    expect(second.references).toEqual(first.references);
    expect(second.assets).toEqual(first.assets);
    expect(second.inputs).not.toEqual(first.inputs); // Exact input bytes are tracked.
    expect(second.summary.localReferences).toBe(1);
  });

  it("rejects duplicate IDs and symlinked dataset files", async () => {
    const root = await fixture();
    const filename = path.join(root, "data/utilities.json");
    const row = { id: "duplicate", slug: "utility", logo: null };
    await writeFile(filename, JSON.stringify([row, row]));
    await expect(inventoryLogos(root)).rejects.toThrow("Duplicate ID");
    await rm(filename);
    await symlink(path.join(root, "data/isos.json"), filename);
    await expect(inventoryLogos(root)).rejects.toThrow("Expected a regular file");
  });

  it("rejects symlinked input directories", async () => {
    const root = await fixture();
    await rm(path.join(root, "public/logos"), { recursive: true });
    await symlink(path.join(root, "data"), path.join(root, "public/logos"));
    await expect(inventoryLogos(root)).rejects.toThrow("Expected a directory");
  });
  it("rejects CLI action flags without emitting a manifest", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/inventory-logos.ts", "--apply"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("read-only; JSON to stdout; no flags");
  });
});
