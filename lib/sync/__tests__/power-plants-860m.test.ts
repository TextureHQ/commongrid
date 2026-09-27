import { describe, expect, it } from "vitest";
import { type MonthlyPlantRecord, toSyncRecords } from "../power-plants-860m";

const plant: MonthlyPlantRecord = {
  id: "plant-1",
  slug: "example",
  name: "Example",
  plantCode: "1",
  utilityName: "Example utility",
  state: "CO",
  latitude: 40,
  longitude: -105,
  sector: "Electric Utility",
  status: "operable",
  totalCapacityMw: 100,
  generatorCount: 1,
  primaryFuel: "SUN",
  fuelCategory: "Solar",
  technologies: ["Solar Photovoltaic"],
  energySources: ["SUN"],
  operatingYear: 2020,
  proposedCapacityMw: null,
  proposedOnlineYear: null,
};

describe("EIA-860M provenance", () => {
  it.each([true, false])("carries workbook vintage for existing=%s", (existing) => {
    const asOf = new Date("2026-07-01T00:00:00Z");
    const [record] = toSyncRecords([plant], new Set(existing ? [plant.id] : []), asOf);
    expect(record).toMatchObject({ entityId: plant.id, sourceId: "eia-860m", asOf });
    expect(record?.fields).not.toHaveProperty("asOf");
    expect(record?.fields).not.toHaveProperty("sourceId");
    if (existing) expect(record?.fields).not.toHaveProperty("name");
    else expect(record?.fields.name).toBe("Example");
  });

  it("preserves explicit unknown vintage", () => {
    expect(toSyncRecords([plant], new Set(), null)[0]?.asOf).toBeNull();
  });
});
