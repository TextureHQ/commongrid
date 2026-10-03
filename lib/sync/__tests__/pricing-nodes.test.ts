import { describe, expect, it } from "vitest";
import { PRICING_NODE_OWNED_FIELDS, type PricingNodeRecord, toSyncRecords } from "../pricing-nodes";

const node: PricingNodeRecord = {
  id: "caiso-sp15",
  slug: "sp15-south-of-path-15-caiso-hub",
  name: "SP15 (South of Path 15)",
  iso: "CAISO",
  nodeType: "hub",
  latitude: 34.05,
  longitude: -118.25,
  zone: "SP15",
  state: "CA",
  voltageKv: null,
  eiaPlantCode: null,
  source: "caiso-oasis",
};

describe("pricing-nodes provenance", () => {
  it.each([true, false])("carries sync vintage for existing=%s", (existing) => {
    const asOf = new Date("2026-10-01T00:00:00Z");
    const [record] = toSyncRecords([node], new Set(existing ? [node.id] : []), asOf);
    expect(record).toMatchObject({ entityId: node.id, slug: node.slug, sourceId: node.source, asOf });
    expect(record?.fields).not.toHaveProperty("asOf");
    expect(record?.fields).not.toHaveProperty("sourceId");
    expect(record?.fields).toHaveProperty("name", node.name);
    expect(record?.fields).toHaveProperty("iso", node.iso);
  });

  it("preserves explicit unknown vintage", () => {
    expect(toSyncRecords([node], new Set(), null)[0]?.asOf).toBeNull();
  });

  it("only includes owned fields", () => {
    const [record] = toSyncRecords([node], new Set([node.id]), new Date());
    const fieldNames = Object.keys(record?.fields ?? {});
    expect(fieldNames).toHaveLength(PRICING_NODE_OWNED_FIELDS.length);
    for (const field of PRICING_NODE_OWNED_FIELDS) {
      expect(fieldNames).toContain(field);
    }
    expect(record?.fields).not.toHaveProperty("lockedStatus");
    expect(record?.fields).not.toHaveProperty("submittedBy");
    expect(record?.fields).not.toHaveProperty("reviewedAt");
  });

  it("defaults sourceUrl to null when omitted", () => {
    const [record] = toSyncRecords([node], new Set(), null);
    expect(record?.fields).toHaveProperty("sourceUrl", null);
  });

  it("carries sourceUrl when provided", () => {
    const withUrl: PricingNodeRecord = { ...node, sourceUrl: "https://oasis.caiso.com" };
    const [record] = toSyncRecords([withUrl], new Set(), null);
    expect(record?.fields).toHaveProperty("sourceUrl", "https://oasis.caiso.com");
  });

  it("classifies existing ids as updates and new ids as creates with the same owned field set", () => {
    const existingId = "existing-node";
    const newId = "new-node";
    const nodes: PricingNodeRecord[] = [
      { ...node, id: existingId, slug: "existing" },
      { ...node, id: newId, slug: "new" },
    ];
    const records = toSyncRecords(nodes, new Set([existingId]), null);
    expect(records).toHaveLength(2);

    const existingRecord = records.find((r) => r.entityId === existingId);
    const newRecord = records.find((r) => r.entityId === newId);

    expect(existingRecord).toBeDefined();
    expect(newRecord).toBeDefined();

    // Both carry the full owned field set because all content fields are owned.
    expect(Object.keys(existingRecord?.fields ?? {})).toEqual(PRICING_NODE_OWNED_FIELDS);
    expect(Object.keys(newRecord?.fields ?? {})).toEqual(PRICING_NODE_OWNED_FIELDS);

    expect(existingRecord?.slug).toBe("existing");
    expect(newRecord?.slug).toBe("new");
  });
});
