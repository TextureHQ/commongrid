import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EDIT_ENTITY_DRAWER_CLASSNAME, SHELL_HEADER_HEIGHT_PX } from "../editEntityPanelLayout";

/**
 * CG-322 regression coverage.
 *
 * The Suggest Edit drawer was clipped under the sticky 60px shell nav because
 * the Edges Drawer anchors at top:0 while `.cg-nav` sits at a higher z-index.
 * These assertions lock in the header-safe offset without needing a DOM
 * renderer (the repo test harness runs in Node with no jsdom/RTL).
 */
describe("EditEntityPanel drawer offset (CG-322)", () => {
  it("offsets the drawer below the sticky shell header", () => {
    expect(EDIT_ENTITY_DRAWER_CLASSNAME).toContain(`!top-[${SHELL_HEADER_HEIGHT_PX}px]`);
    expect(EDIT_ENTITY_DRAWER_CLASSNAME).toContain(`!h-[calc(100dvh-${SHELL_HEADER_HEIGHT_PX}px)]`);
  });

  it("uses a static Tailwind class literal so the arbitrary values are scanned into the build", () => {
    // A dynamically composed class (e.g. `!top-[${n}px]`) would be dropped by
    // Tailwind's content scanner. Assert the source keeps the literal verbatim.
    const layoutSrc = readFileSync(fileURLToPath(new URL("../editEntityPanelLayout.ts", import.meta.url)), "utf8");
    expect(layoutSrc).toContain('"!top-[60px] !h-[calc(100dvh-60px)]"');
  });

  it("keeps the offset in sync with the documented shell nav height", () => {
    // `.cg-nav-inner { height: 60px }` in app/globals.css. If the nav height
    // changes, this test forces the drawer offset to be revisited.
    expect(SHELL_HEADER_HEIGHT_PX).toBe(60);
  });

  it("is actually applied by EditEntityPanel", () => {
    const panelSrc = readFileSync(fileURLToPath(new URL("../EditEntityPanel.tsx", import.meta.url)), "utf8");
    expect(panelSrc).toContain("className={EDIT_ENTITY_DRAWER_CLASSNAME}");
  });
});
