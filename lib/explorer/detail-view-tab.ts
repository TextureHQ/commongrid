import type { EntityTab } from "@/components/explorer/explorer-route-state";

export type DetailView = "utility" | "iso" | "rto" | "ba" | "program" | "power-plant";

export const DETAIL_VIEW_TO_TAB: Record<DetailView, EntityTab> = {
  utility: "utilities",
  program: "programs",
  "power-plant": "power-plants",
  iso: "grid-operators",
  rto: "grid-operators",
  ba: "grid-operators",
};

export function detailViewToTab(view: DetailView): EntityTab {
  return DETAIL_VIEW_TO_TAB[view];
}
