import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { evStations } from "../../db/schema/ev-stations";
import { powerPlants } from "../../db/schema/power-plants";
import { pricingNodes } from "../../db/schema/pricing-nodes";
import { programs } from "../../db/schema/programs";
import { utilities } from "../../db/schema/utilities";
import { editableFieldDefinitions } from "../definitions";

const schemaMap = {
  utility: getTableColumns(utilities),
  power_plant: getTableColumns(powerPlants),
  ev_station: getTableColumns(evStations),
  pricing_node: getTableColumns(pricingNodes),
  program: getTableColumns(programs),
} as const;

describe("Editable Field Registry", () => {
  it("every definition maps to a real column on the entity table", () => {
    const drift: string[] = [];

    for (const def of editableFieldDefinitions) {
      const columns = schemaMap[def.entityType as keyof typeof schemaMap];
      if (!columns) {
        drift.push(`Unknown entityType '${def.entityType}' for field '${def.fieldName}'`);
        continue;
      }

      const hasColumn = Object.entries(columns).some(
        ([key, column]) => key === def.fieldName || column.name === def.fieldName
      );

      if (!hasColumn) {
        drift.push(`${def.entityType}.${def.fieldName} is submittable but has no corresponding database column`);
      }
    }

    expect(drift).toEqual([]);
  });
});
