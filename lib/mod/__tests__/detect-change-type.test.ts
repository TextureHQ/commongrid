import { describe, expect, it } from "vitest";
import { detectChangeType } from "../detect-change-type";

describe("detectChangeType", () => {
  // -----------------------------------------------------------------------
  // Explicit changeType (new contributions with the change_type column set)
  // -----------------------------------------------------------------------

  it('returns "create" when changeType is explicitly "create"', () => {
    expect(
      detectChangeType({
        changeType: "create",
        entityVersion: 0,
        changes: { name: { old: null, new: "New Entity" } },
      })
    ).toBe("create");
  });

  it('returns "create" even when changeType is "create" and entityVersion > 0', () => {
    // Explicit "create" wins over entity version
    expect(
      detectChangeType({
        changeType: "create",
        entityVersion: 5,
        changes: { name: { old: null, new: "New Entity" } },
      })
    ).toBe("create");
  });

  it('returns "delete" when changeType is explicitly "delete"', () => {
    expect(
      detectChangeType({
        changeType: "delete",
        entityVersion: 3,
        changes: { _deletion: { reason: "Duplicate entry" } },
      })
    ).toBe("delete");
  });

  it('returns "update" when changeType is explicitly "update" and entityVersion > 0', () => {
    expect(
      detectChangeType({
        changeType: "update",
        entityVersion: 2,
        changes: { name: { old: "Old", new: "New" } },
      })
    ).toBe("update");
  });

  // -----------------------------------------------------------------------
  // Bug 1 regression: creates with changeType defaulted to "update"
  // -----------------------------------------------------------------------

  it('returns "create" when changeType is "update" but entityVersion is 0 (defaulted changeType)', () => {
    // This is the core Bug 1 fix: a contribution where changeType was
    // defaulted to "update" (e.g., from `change_type ?? "update"`) but
    // entityVersion=0 indicates it's actually a create. Before the fix,
    // this returned "update" and the review handler would try to fetch
    // the non-existent entity, throwing NOT_FOUND.
    expect(
      detectChangeType({
        changeType: "update",
        entityVersion: 0,
        changes: { name: { old: null, new: "New Entity" } },
      })
    ).toBe("create");
  });

  // -----------------------------------------------------------------------
  // Legacy contributions (changeType is null — before change_type column)
  // -----------------------------------------------------------------------

  it('returns "create" for legacy contributions with null changeType and entityVersion=0', () => {
    expect(
      detectChangeType({
        changeType: null,
        entityVersion: 0,
        changes: { name: { old: null, new: "New Entity" } },
      })
    ).toBe("create");
  });

  it('returns "delete" for legacy contributions with _deletion key in changes', () => {
    expect(
      detectChangeType({
        changeType: null,
        entityVersion: 5,
        changes: { _deletion: { reason: "Duplicate entry" } },
      })
    ).toBe("delete");
  });

  it('returns "update" for legacy contributions with no signals for create or delete', () => {
    expect(
      detectChangeType({
        changeType: null,
        entityVersion: 3,
        changes: { website: { old: "http://old.com", new: "http://new.com" } },
      })
    ).toBe("update");
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('returns "update" when changeType is null, entityVersion > 0, and no _deletion key', () => {
    expect(
      detectChangeType({
        changeType: null,
        entityVersion: 1,
        changes: { status: { old: "active", new: "inactive" } },
      })
    ).toBe("update");
  });

  it('returns "create" when entityVersion is 0 regardless of changes content', () => {
    // Even if changes has unusual content, entityVersion=0 means create
    expect(
      detectChangeType({
        changeType: null,
        entityVersion: 0,
        changes: {},
      })
    ).toBe("create");
  });

  it("handles changes being null safely for legacy delete detection", () => {
    expect(
      detectChangeType({
        changeType: null,
        entityVersion: 2,
        changes: null,
      })
    ).toBe("update");
  });

  it('returns "delete" when changeType is "delete" even if _deletion key is absent', () => {
    // Explicit changeType wins over legacy heuristics
    expect(
      detectChangeType({
        changeType: "delete",
        entityVersion: 3,
        changes: { name: { old: "Test", new: null } },
      })
    ).toBe("delete");
  });
});
