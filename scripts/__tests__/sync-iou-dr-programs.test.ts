import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { IOU_DR_REGISTRY } from "@/data/iou-dr-programs/registry";
import { toProgramSyncRecords } from "@/lib/sync/iou-dr-programs";
import type { ResolverUtility } from "@/lib/sync/resolve-entity";
import {
  AssetType,
  DeviceType,
  GridService,
  IncentiveStructure,
  MarketSegment,
  ParticipationModel,
  ProgramStatus,
} from "@/types/programs";
import { htmlToText, isValidHttpUrl, registryEntryToScraped, toResolverUtilities } from "../sync-iou-dr-programs";

const REPO_ROOT = path.resolve(__dirname, "../..");

// Load the real utilities registry once — the resolution assertions below prove
// the curated registry entries actually resolve against production data.
const utilities = toResolverUtilities(
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "data/utilities.json"), "utf-8"))
);

const ENUM_SETS = {
  assetTypes: new Set(Object.values(AssetType)),
  deviceTypes: new Set(Object.values(DeviceType)),
  marketSegments: new Set(Object.values(MarketSegment)),
  participationModels: new Set(Object.values(ParticipationModel)),
  incentiveStructures: new Set(Object.values(IncentiveStructure)),
  gridServices: new Set(Object.values(GridService)),
} as const;

describe("IOU DR registry", () => {
  it("is non-empty and every entry has a name, utility ref, and valid program URL", () => {
    expect(IOU_DR_REGISTRY.length).toBeGreaterThanOrEqual(50);
    for (const entry of IOU_DR_REGISTRY) {
      expect(entry.name, "program name").toBeTruthy();
      expect(entry.utility, `utility ref for ${entry.name}`).toBeTruthy();
      // At least one usable identifier for the resolver.
      const hasId =
        entry.utility.eiaId != null ||
        (entry.utility.baCode != null && entry.utility.state != null) ||
        (entry.utility.name != null && entry.utility.name.length > 0);
      expect(hasId, `${entry.name} needs a resolvable utility identifier`).toBe(true);
      expect(isValidHttpUrl(entry.programWebsite), `${entry.name} program URL`).toBe(true);
      if (entry.faqUrl) expect(isValidHttpUrl(entry.faqUrl)).toBe(true);
      if (entry.termsUrl) expect(isValidHttpUrl(entry.termsUrl)).toBe(true);
      if (entry.contactUrl) expect(isValidHttpUrl(entry.contactUrl)).toBe(true);
    }
  });

  it("only emits valid enum values across every enum-typed field", () => {
    for (const entry of IOU_DR_REGISTRY) {
      for (const [field, set] of Object.entries(ENUM_SETS)) {
        const values = (entry as Record<string, unknown>)[field] as string[] | undefined;
        if (!values) continue;
        for (const v of values) {
          expect(set.has(v as never), `${entry.name}.${field} has invalid value ${v}`).toBe(true);
        }
      }
      if (entry.status) {
        expect(new Set(Object.values(ProgramStatus)).has(entry.status), `${entry.name}.status`).toBe(true);
      }
    }
  });

  it("resolves every registry entry to a utility in data/utilities.json", () => {
    const scraped = IOU_DR_REGISTRY.map((e) => registryEntryToScraped(e));
    const { records, unresolved } = toProgramSyncRecords(
      scraped,
      utilities as Array<ResolverUtility & { slug: string }>
    );
    // The whole point of the registry curation is a high resolution rate; the
    // curated set is tuned to resolve 100% against production utilities.json.
    expect(unresolved, `unresolved entries: ${unresolved.map((u) => u.name).join(", ")}`).toEqual([]);
    expect(records.length).toBe(IOU_DR_REGISTRY.length);
  });

  it("produces globally-unique program slugs (no accidental id collisions)", () => {
    const scraped = IOU_DR_REGISTRY.map((e) => registryEntryToScraped(e));
    const { records } = toProgramSyncRecords(scraped, utilities as Array<ResolverUtility & { slug: string }>);
    const ids = records.map((r) => r.entityId);
    expect(new Set(ids).size, "duplicate program entityId").toBe(ids.length);
  });
});

describe("registryEntryToScraped", () => {
  it("passes the curated facts through and normalizes the utility ref for the resolver", () => {
    const entry = IOU_DR_REGISTRY.find((e) => e.utility.eiaId != null);
    expect(entry).toBeDefined();
    if (!entry) return;
    const scraped = registryEntryToScraped(entry);
    expect(scraped.name).toBe(entry.name);
    expect(scraped.programWebsite).toBe(entry.programWebsite);
    expect(scraped.utility.eiaId).toBe(entry.utility.eiaId);
    // Missing sub-fields are normalized to null (not undefined) for the resolver.
    expect(scraped.utility.baCode).toBeDefined();
    expect(scraped.utility.state).toBeDefined();
  });

  it("prefers a fetched description over the curated one when provided", () => {
    const entry = IOU_DR_REGISTRY[0];
    const scraped = registryEntryToScraped(entry, "Live page description");
    expect(scraped.description).toBe("Live page description");
  });

  it("falls back to the curated description when no fetched one is given", () => {
    const entry = { ...IOU_DR_REGISTRY[0], description: "Curated blurb" };
    const scraped = registryEntryToScraped(entry);
    expect(scraped.description).toBe("Curated blurb");
  });
});

describe("isValidHttpUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(isValidHttpUrl("https://www.example.com/programs")).toBe(true);
    expect(isValidHttpUrl("http://example.com")).toBe(true);
  });

  it("rejects nullish, relative, and non-http schemes", () => {
    expect(isValidHttpUrl(undefined)).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
    expect(isValidHttpUrl("/relative/path")).toBe(false);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("htmlToText", () => {
  it("prefers the meta description when present", () => {
    const html = `<html><head><meta name="description" content="Enroll your smart thermostat and earn bill credits."></head><body><p>ignored</p></body></html>`;
    expect(htmlToText(html)).toBe("Enroll your smart thermostat and earn bill credits.");
  });

  it("falls back to stripped body text and decodes entities", () => {
    const html = `<html><body><h1>Peak &amp; Save</h1><p>Save 10&#39;s of dollars.</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Peak & Save");
    expect(text).toContain("Save 10's of dollars.");
  });

  it("strips script/style content and collapses whitespace", () => {
    const html = `<style>.x{color:red}</style><script>var a=1;</script><div>  Real   text   here  </div>`;
    expect(htmlToText(html)).toBe("Real text here");
  });

  it("truncates overly long text with an ellipsis", () => {
    const long = `<div>${"word ".repeat(200)}</div>`;
    const text = htmlToText(long, 50);
    expect(text.length).toBeLessThanOrEqual(50);
    expect(text.endsWith("…")).toBe(true);
  });

  it("returns an empty string when there is no textual content", () => {
    expect(htmlToText("<html><head></head><body></body></html>")).toBe("");
  });
});

describe("toResolverUtilities", () => {
  it("keeps only id+slug-bearing rows and narrows to resolver columns", () => {
    const raw = [
      { id: "u1", slug: "duke", name: "Duke", eiaId: 5416, baCode: "DUK", state: "NC", extra: "dropped" },
      { id: "u2", name: "No slug" }, // dropped: no slug
      { slug: "no-id" }, // dropped: no id
    ];
    const out = toResolverUtilities(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: "u1", slug: "duke", name: "Duke", eiaId: 5416, baCode: "DUK", state: "NC" });
    expect(out[0]).not.toHaveProperty("extra");
  });

  it("defaults missing optional identifiers to null and returns [] for non-arrays", () => {
    const out = toResolverUtilities([{ id: "u1", slug: "x", name: "X" }]);
    expect(out[0].eiaId).toBeNull();
    expect(out[0].baCode).toBeNull();
    expect(out[0].state).toBeNull();
    expect(toResolverUtilities(null)).toEqual([]);
    expect(toResolverUtilities({})).toEqual([]);
  });
});
