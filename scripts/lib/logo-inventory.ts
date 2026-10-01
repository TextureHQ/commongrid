import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const datasets = ["utilities", "isos", "rtos", "balancing-authorities"] as const;
const recordsSchema = z.array(
  z.object({ id: z.string().min(1), slug: z.string().min(1), logo: z.string().nullable() })
);
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// Only literal repository paths are resolved. Never fetch external URLs or decode
// escape sequences; migration must not interpret arbitrary logo values as paths.
function isLocalLogo(value: string): boolean {
  return (
    value.startsWith("/logos/") &&
    value
      .slice(7)
      .split("/")
      .every((part) => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part))
  );
}

async function assertRegularFile(filename: string): Promise<void> {
  if (!(await lstat(filename)).isFile()) throw new Error(`Expected a regular file: ${filename}`);
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  if (!(await lstat(directory)).isDirectory()) throw new Error(`Expected a directory: ${directory}`);
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(path.join(directory, entry.name), relative)));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unsupported logo directory entry: ${relative}`);
  }
  return files.sort();
}

/** Read-only repository snapshot, not an authoritative inventory of live DB values. */
export async function inventoryLogos(root: string) {
  // Reject symlinked input directories as well as individual files.
  for (const directory of ["data", "public"]) {
    if (!(await lstat(path.join(root, directory))).isDirectory()) {
      throw new Error(`Expected a directory: ${directory}`);
    }
  }
  const files = await listFiles(path.join(root, "public/logos"));
  const available = new Set(files.map((file) => `/logos/${file}`));
  const inputs: { path: string; sha256: string }[] = [];
  const references: {
    dataset: (typeof datasets)[number];
    id: string;
    slug: string;
    currentLogo: string | null;
    status: "absent" | "local" | "missing" | "external" | "unsupported";
  }[] = [];

  for (const dataset of datasets) {
    const relative = `data/${dataset}.json`;
    const filename = path.join(root, relative);
    await assertRegularFile(filename);
    const bytes = await readFile(filename);
    inputs.push({ path: relative, sha256: sha256(bytes) });
    const records = recordsSchema.parse(JSON.parse(bytes.toString("utf8")));
    const ids = new Set<string>();
    for (const record of records) {
      if (ids.has(record.id)) throw new Error(`Duplicate ID in ${relative}: ${record.id}`);
      ids.add(record.id);
      const logo = record.logo;
      let status: (typeof references)[number]["status"] = "unsupported";
      if (logo === null || logo === "") status = "absent";
      else if (isLocalLogo(logo)) status = available.has(logo) ? "local" : "missing";
      else {
        try {
          const url = new URL(logo);
          if (url.protocol === "https:" || url.protocol === "http:") status = "external";
        } catch {
          // Preserve unsupported values verbatim for manual investigation.
        }
      }
      references.push({ dataset, id: record.id, slug: record.slug, currentLogo: logo, status });
    }
  }
  references.sort((a, b) => {
    const left = `${a.dataset}/${a.id}`;
    const right = `${b.dataset}/${b.id}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });

  const assets = [];
  for (const file of files) {
    const relative = `public/logos/${file}`;
    const filename = path.join(root, relative);
    await assertRegularFile(filename);
    const bytes = await readFile(filename);
    const publicPath = `/logos/${file}`;
    assets.push({
      repositoryPath: relative,
      publicPath,
      sha256: sha256(bytes),
      bytes: bytes.length,
      references: references
        .filter((ref) => ref.status === "local" && ref.currentLogo === publicPath)
        .map(({ dataset, id }) => ({ dataset, id })),
      // A utility website is NOT evidence of where its logo was acquired.
      sourceUrl: null,
      usageNote: null,
      provenanceStatus: "needs-review" as const,
    });
  }
  const hashes = new Map<string, string[]>();
  for (const asset of assets) {
    const paths = hashes.get(asset.sha256) ?? [];
    paths.push(asset.publicPath);
    hashes.set(asset.sha256, paths);
  }
  const duplicateContent = [...hashes.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([hash, paths]) => ({ sha256: hash, paths }));

  return {
    schemaVersion: 1,
    scope: "repository-only",
    inputs,
    summary: {
      entities: references.length,
      utilityEntities: references.filter((ref) => ref.dataset === "utilities").length,
      assets: assets.length,
      localReferences: references.filter((ref) => ref.status === "local").length,
      missingReferences: references.filter((ref) => ref.status === "missing").length,
      absentReferences: references.filter((ref) => ref.status === "absent").length,
      externalReferences: references.filter((ref) => ref.status === "external").length,
      unsupportedReferences: references.filter((ref) => ref.status === "unsupported").length,
      unreferencedAssets: assets.filter((asset) => asset.references.length === 0).length,
      sharedAssets: assets.filter((asset) => asset.references.length > 1).length,
      duplicateContentGroups: duplicateContent.length,
    },
    references,
    assets,
    duplicateContent,
  };
}
