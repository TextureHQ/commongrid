/**
 * Copies territory GeoJSON from data/ to public/data/ for Next.js serving.
 * Runs automatically before `next build` via the `prebuild` npm script.
 */
import { cpSync, mkdirSync } from "fs";

mkdirSync("public/data", { recursive: true });
cpSync("data/territories", "public/data/territories", { recursive: true });
console.log("✅ Copied territory GeoJSON to public/data/territories/");
