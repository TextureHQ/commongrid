import { describe, expect, it } from "vitest";
import { editableFieldDefinitions } from "../definitions";
import { utilities } from "../../db/schema/utilities";
import { powerPlants } from "../../db/schema/power-plants";
import { evStations } from "../../db/schema/ev-stations";
import { pricingNodes } from "../../db/schema/pricing-nodes";
import { programs } from "../../db/schema/programs";
import { getTableColumns } from "drizzle-orm";

const schemaMap: Record<string, any> = {
  utility: getTableColumns(utilities),
  power_plant: getTableColumns(powerPlants),
  ev_station: getTableColumns(evStations),
  pricing_node: getTableColumns(pricingNodes),
  program: getTableColumns(programs),
};

describe("Editable Field Registry", () => {
  it("every definition maps to a real column on the entity table", () => {
    const drift: string[] = [];

    for (const def of editableFieldDefinitions) {
      const columns = schemaMap[def.entityType];
      if (!columns) {
        drift.push(`Unknown entityType '${def.entityType}' for field '${def.fieldName}'`);
        continue;
      }
      
      // The fieldName must exist in the columns object (which is keyed by the typescript property name,
      // but some definitions might use snake_case matching the db column name. Let's check both).
      // Wait, Drizzle columns object keys are the typescript property names (e.g., customerCount).
      // The definitions.fieldName might be snake_case (customer_count).
      // Let's check the columns values to match by database column name.
      const hasColumn = Object.values(columns).some((col: any) => col.name === def.fieldName || col.name === def.fieldName.toLowerCase());
      
      // Some fields like device_types might be camelCase in definitions? Let's check.
      // In definitions.ts, it's fieldName: "other_notes", etc.
      // Drizzle column name is usually snake_case.
      if (!hasColumn) {
         // Fallback check against the keys just in case
         if (!(def.fieldName in columns)) {
             drift.push(`${def.entityType}.${def.fieldName} is submittable but has no corresponding database column`);
         }
      }
    }

    expect(drift).toEqual([]);
  });
});
