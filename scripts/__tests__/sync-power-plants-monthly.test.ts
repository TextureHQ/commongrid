import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { aggregateGenerators, extractMonthlyFilenames, parseEia860mWorkbook } from "../sync-power-plants-monthly";

const baselineWorkbook = path.resolve(__dirname, "../../../data/eia-860m/march_generator2026.xlsx");

describe("EIA-860M monthly sync", () => {
  it("extracts only live monthly workbook links and ignores commented future placeholders", () => {
    const html = `
      <!--<a href="/electricity/data/eia860m/xls/december_generator2026.xlsx">future placeholder</a>-->
      <a href="/electricity/data/eia860m/archive/xls/february_generator2026.xlsx">February 2026</a>
      <a href="/electricity/data/eia860m/xls/march_generator2026.xlsx">March 2026</a>
      <a href="/electricity/data/eia860m/xls/march_generator2026.xlsx">duplicate</a>
    `;

    expect(extractMonthlyFilenames(html)).toEqual(["february_generator2026.xlsx", "march_generator2026.xlsx"]);
  });

  it.skipIf(!fs.existsSync(baselineWorkbook))(
    "parses all seven March 2026 workbook sheets",
    () => {
      const { rows, sheetRowCounts } = parseEia860mWorkbook(baselineWorkbook);

      expect(sheetRowCounts).toEqual({
        Operating: 27834,
        Planned: 2317,
        Retired: 7251,
        "Canceled or Postponed": 1686,
        Operating_PR: 225,
        Planned_PR: 8,
        Retired_PR: 10,
      });
      expect(rows).toHaveLength(39331);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            plantCode: "61014",
            generatorId: "1",
            state: "PR",
            capacityMw: 101.2,
            sourceSheet: "Operating_PR",
          }),
        ])
      );
    },
    15_000
  );

  it.skipIf(!fs.existsSync(baselineWorkbook))(
    "aggregates Puerto Rico generators from _PR sheets into the plant inventory",
    () => {
      const { rows } = parseEia860mWorkbook(baselineWorkbook);
      const aggregates = aggregateGenerators(rows);

      // Puerto Rico plants are sourced from EIA-860M Operating_PR + Planned_PR sheets.
      // EIA-860M ships 225 operating + 8 planned PR generator rows across ~69 unique plants.
      const prPlants = Array.from(aggregates.values()).filter((agg) => agg.state === "PR");
      expect(prPlants.length).toBeGreaterThanOrEqual(60);
      expect(prPlants.length).toBeLessThanOrEqual(80);

      const prOperatingRows = rows.filter((row) => row.sourceSheet === "Operating_PR");
      const prPlannedRows = rows.filter((row) => row.sourceSheet === "Planned_PR");
      const operatingGenerators = prPlants.reduce((sum, agg) => sum + agg.operatingGeneratorCount, 0);
      const plannedGenerators = prPlants.reduce((sum, agg) => sum + agg.proposedGeneratorCount, 0);
      expect(operatingGenerators).toBe(prOperatingRows.length);
      expect(plannedGenerators).toBe(prPlannedRows.length);

      // Every PR plant must have at least one PR-sourced row (no accidental mainland contamination).
      for (const agg of prPlants) {
        const fromPrSheet =
          agg.sourceSheets.has("Operating_PR") ||
          agg.sourceSheets.has("Planned_PR") ||
          agg.sourceSheets.has("Retired_PR");
        expect(fromPrSheet).toBe(true);
      }

      // Sanity-check a known landmark plant: AES Puerto Rico (plant code 50098 in EIA data).
      // We don't pin a specific plant code (EIA reshuffles them), but at least one PR plant
      // should be petroleum-fired since the island fleet is overwhelmingly oil-based.
      const fuelSources = new Set<string>();
      for (const agg of prPlants) {
        for (const source of agg.energySources) fuelSources.add(source);
      }
      const hasPetroleum = ["DFO", "RFO", "KER", "JF", "PC", "WO"].some((code) => fuelSources.has(code));
      expect(hasPetroleum).toBe(true);
    },
    15_000
  );
});
