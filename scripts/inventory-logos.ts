import path from "node:path";
import { fileURLToPath } from "node:url";
import { inventoryLogos } from "./lib/logo-inventory";

async function main() {
  if (process.argv.length > 2) {
    throw new Error("Usage: npx tsx scripts/inventory-logos.ts (read-only; JSON to stdout; no flags)");
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = await inventoryLogos(root);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Logo inventory failed");
  process.exitCode = 1;
});
