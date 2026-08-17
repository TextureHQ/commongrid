/**
 * The denormalized entity_name / entity_slug on entity_versions.
 *
 * (entity_type, entity_id) is polymorphic with no foreign key, so a changelog
 * row cannot be rendered without these unless the feed joins across eleven
 * tables per row. Every path that writes a version — the community write path
 * and the backfill — derives them from this one helper, or the feed shows
 * labels for some entities and blanks for others.
 */

import { describe, expect, it } from "vitest";
import { buildVersionRecord, entityLabel } from "@/lib/db/versioning";

describe("entityLabel", () => {
  it("reads `name` where the table has one", () => {
    expect(entityLabel({ name: "Pacific Gas & Electric", slug: "pge" })).toEqual({
      entityName: "Pacific Gas & Electric",
      entitySlug: "pge",
    });
  });

  it("falls back to stationName — ev_stations has no `name`, and is half the corpus", () => {
    expect(entityLabel({ stationName: "NIU DeKalb", slug: "niu-dekalb-il" }).entityName).toBe("NIU DeKalb");
  });

  it("returns nulls for tables with no label column rather than inventing one", () => {
    expect(entityLabel({ id: "t-1", version: 1 })).toEqual({ entityName: null, entitySlug: null });
  });

  it("ignores non-string values instead of writing them through", () => {
    expect(entityLabel({ name: 42, slug: null }).entityName).toBeNull();
  });

  it("handles a missing row", () => {
    expect(entityLabel(null)).toEqual({ entityName: null, entitySlug: null });
  });
});

describe("buildVersionRecord labels", () => {
  it("populates the label on a v1 snapshot", () => {
    const r = buildVersionRecord("utility", "u-1", 1, { name: "Acme Power", slug: "acme" }, null, "create", "user-1");
    expect(r.entityName).toBe("Acme Power");
    expect(r.entitySlug).toBe("acme");
  });

  it("attributes a rename to the version that made it", () => {
    // Taken from newData, not oldData: the version that renamed the entity
    // should read as the new name in the feed, not the one it replaced.
    const r = buildVersionRecord(
      "utility",
      "u-1",
      2,
      { name: "Acme Energy", slug: "acme" },
      { name: "Acme Power", slug: "acme" },
      "update",
      "user-1"
    );
    expect(r.entityName).toBe("Acme Energy");
    expect(r.delta).toHaveProperty("name");
  });
});
