import { beforeEach, describe, expect, it, vi } from "vitest";
import { addContributionContext } from "../contribution-context";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: lookup }) }) }) }));
const contribution = {
  entityType: "utility",
  entityId: "u1",
  entitySlug: "old-slug",
  changeType: "update",
  changes: {},
};

describe("contribution context", () => {
  beforeEach(() => lookup.mockReset());
  it("resolves the current name and slug by ID and batches a queue by type", async () => {
    lookup.mockResolvedValue([{ id: "u1", name: "Rhode Island Energy", slug: "rhode-island-energy" }]);
    const rows = await addContributionContext([contribution, contribution]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(rows[0].entityContext).toEqual({
      name: "Rhode Island Energy",
      href: "/grid-operators/rhode-island-energy",
      availability: "published",
    });
  });
  it("labels unpublished creates without linking to a nonexistent page", async () => {
    lookup.mockResolvedValue([]);
    const [row] = await addContributionContext([
      { ...contribution, changeType: "create", changes: { name: { new: "New utility" } } },
    ]);
    expect(row.entityContext).toEqual({ name: "New utility", href: null, availability: "new" });
  });
  it("links an applied create once its entity exists", async () => {
    lookup.mockResolvedValue([{ id: "u1", name: "Published", slug: "published" }]);
    const [row] = await addContributionContext([{ ...contribution, changeType: "create" }]);
    expect(row.entityContext.href).toBe("/grid-operators/published");
  });
  it("does not create dead links for missing entities", async () => {
    lookup.mockResolvedValue([]);
    const [row] = await addContributionContext([contribution]);
    expect(row.entityContext).toEqual({ name: "old-slug", href: null, availability: "unavailable" });
  });
  it.each([
    ["iso", "/explore/grid-operators/current"],
    ["rto", "/explore/grid-operators/current"],
    ["program", "/explore/programs/current"],
    ["transmission_line", "/transmission-lines/u1"],
    ["territory", null],
    ["region", null],
  ])("uses canonical routes for %s", async (entityType, href) => {
    lookup.mockResolvedValue([{ id: "u1", name: "Current", slug: "current" }]);
    const [row] = await addContributionContext([{ ...contribution, entityType: entityType as string }]);
    expect(row.entityContext.href).toBe(href);
  });
  it("handles unknown types without querying a made-up table", async () => {
    const [row] = await addContributionContext([{ ...contribution, entityType: "unknown" }]);
    expect(row.entityContext.href).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
