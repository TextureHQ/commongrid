import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { extractMonthlyFilenames, parseEia860mWorkbook } from "../sync-power-plants-monthly";

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
});
