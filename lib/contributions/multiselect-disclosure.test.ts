/**
 * Regression test: a multi-select group whose value arrives after mount must
 * still open expanded.
 *
 * Context: the collapsible groups first shipped with
 * `useState(selected.length > 0)`. The form seeds its values in an effect that
 * runs after the fields render, so at mount every value is undefined; the
 * initializer captured `false` and never re-ran. On an entity that already had
 * asset types set, the group rendered collapsed — with the selection visible in
 * its own summary line, which made the bug easy to look straight past.
 */

import { describe, expect, it } from "vitest";
import { isMultiSelectExpanded } from "./multiselect-disclosure";

describe("isMultiSelectExpanded", () => {
  it("stays collapsed when nothing is selected", () => {
    expect(isMultiSelectExpanded({ userToggled: null, selectedCount: 0 })).toBe(false);
  });

  it("expands when the entity already has a value", () => {
    expect(isMultiSelectExpanded({ userToggled: null, selectedCount: 2 })).toBe(true);
  });

  it("expands once a value seeded after mount arrives", () => {
    // The two renders the form actually produces: fields present but values not
    // yet seeded, then seeded. The second must expand — this is the regression.
    const atMount = isMultiSelectExpanded({ userToggled: null, selectedCount: 0 });
    const afterSeeding = isMultiSelectExpanded({ userToggled: null, selectedCount: 2 });

    expect(atMount).toBe(false);
    expect(afterSeeding).toBe(true);
  });

  it("lets a deliberate collapse win over a present value", () => {
    expect(isMultiSelectExpanded({ userToggled: false, selectedCount: 3 })).toBe(false);
  });

  it("lets a deliberate open win over an empty selection", () => {
    expect(isMultiSelectExpanded({ userToggled: true, selectedCount: 0 })).toBe(true);
  });
});
