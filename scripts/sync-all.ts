/**
 * Orchestrator: Run all sync scripts in dependency order.
 *
 * Usage:
 *   cd apps/commongrid
 *   export $(cat ../../packages/notion-client/.env | xargs) && yarn sync:all
 */

import { execSync } from "node:child_process";

const steps = [
  { script: "sync:notion", label: "Notion → utilities, ISOs, RTOs" },
  { script: "sync:arcgis", label: "ArcGIS → service territories, ISO boundaries" },
  { script: "enrich:eia", label: "EIA analysis → missing utilities" },
  { script: "sync:eia", label: "EIA-861 XLSX → utility fields" },
  { script: "sync:cca", label: "CEC ArcGIS → CCA territories" },
  { script: "sync:ba", label: "HIFLD + EIA → balancing authorities" },
  { script: "sync:power-plants", label: "EIA-860 → power plants" },
  { script: "generate:changelog", label: "Diff data → changelog.json" },
];

console.log(`Running ${steps.length} sync steps\n`);

for (const [i, step] of steps.entries()) {
  const num = i + 1;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`Step ${num}/${steps.length}: ${step.label}`);
  console.log(`${"═".repeat(60)}\n`);

  try {
    execSync(`yarn ${step.script}`, { stdio: "inherit" });
  } catch {
    console.error(`\nStep ${num} failed (${step.script}). Aborting.`);
    process.exit(1);
  }
}

console.log(`\n${"═".repeat(60)}`);
console.log("All sync steps complete.");
console.log(`${"═".repeat(60)}`);
