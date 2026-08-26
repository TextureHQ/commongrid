/**
 * CI guard against schema drift in community-editable field definitions.
 *
 * Every field declared editable in definitions.ts must correspond to an actual
 * column on the matching Drizzle table. This catches orphans such as the
 * historical `program.device_types` row that survived after the column was
 * removed from the programs schema (CG-255).
 */

import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { editableFieldDefinitions } from "@/lib/community-editable-fields/definitions";
import { evStations, powerPlants, pricingNodes, programs, utilities } from "@/lib/db/schema";

const entityTypeToTable = {
  utility: utilities,
  power_plant: powerPlants,
  ev_station: evStations,
  pricing_node: pricingNodes,
  program: programs,
} as const;

type EntityType = keyof typeof entityTypeToTable;

const tableColumnNames = Object.fromEntries(
  Object.entries(entityTypeToTable).map(([entityType, table]) => {
    const columns = getTableColumns(table);
    const names = new Set(Object.values(columns).map((column) => column.name));
    return [entityType, names];
  })
) as Record<EntityType, Set<string>>;

describe("community-editable field definitions map to real schema columns", () => {
  for (const field of editableFieldDefinitions) {
    it(`${field.entityType}.${field.fieldName} exists on the Drizzle schema`, () => {
      const table = entityTypeToTable[field.entityType as EntityType];
      expect(table, `no Drizzle table mapped for entity type "${field.entityType}"`).toBeDefined();

      const columnNames = tableColumnNames[field.entityType as EntityType];
      const tableName = (table as unknown as Record<string, unknown>)._
        ? ((table as unknown as Record<string, { name: string }>)._.name as string)
        : field.entityType;
      expect(columnNames.has(field.fieldName), `"${field.fieldName}" is not a column on ${tableName}`).toBe(true);
    });
  }
});
