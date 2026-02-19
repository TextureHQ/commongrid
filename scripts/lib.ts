import * as fs from "node:fs";
import * as path from "node:path";

export const DATA_DIR = path.resolve(__dirname, "../data");
export const TERRITORIES_DIR = path.resolve(__dirname, "../public/data/territories");

interface SlugifyOptions {
  stripParentheticals?: boolean;
  normalizeEmDashes?: boolean;
}

export function slugify(name: string, options: SlugifyOptions = {}): string {
  let s = name.toLowerCase().replace(/&/g, "and");
  if (options.normalizeEmDashes) s = s.replace(/[—–]/g, "-");
  if (options.stripParentheticals) s = s.replace(/\([^)]*\)/g, "");
  return s.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function readJSON<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), "utf-8"));
}

export function writeJSON(filename: string, data: unknown): void {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  Wrote ${filepath}`);
}

export function writeTerritory(filename: string, data: unknown): void {
  fs.writeFileSync(path.join(TERRITORIES_DIR, filename), JSON.stringify(data));
}
