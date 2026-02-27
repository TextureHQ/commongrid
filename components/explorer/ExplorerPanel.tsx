"use client";

import { useExplorer } from "./ExplorerContext";
import { UtilityListPanel } from "./panels/UtilityListPanel";
import { GridOperatorListPanel } from "./panels/GridOperatorListPanel";
import { ProgramListPanel } from "./panels/ProgramListPanel";
import { PowerPlantListPanel } from "./panels/PowerPlantListPanel";
import { TransmissionListPanel } from "./panels/TransmissionListPanel";
import { UtilityDetailPanel } from "./panels/UtilityDetailPanel";
import { IsoDetailPanel } from "./panels/IsoDetailPanel";
import { RtoDetailPanel } from "./panels/RtoDetailPanel";
import { BADetailPanel } from "./panels/BADetailPanel";
import { ProgramDetailPanel } from "./panels/ProgramDetailPanel";

export function ExplorerPanel() {
  const { state } = useExplorer();

  // Detail views (slug-based, tab tells us entity type context)
  if (state.mode === "detail" && state.slug) {
    switch (state.tab) {
      case "utilities":
        return <UtilityDetailPanel slug={state.slug} />;
      case "grid-operators":
        // Grid operators can be iso/rto/ba — we need to detect type from slug
        // Use the existing detail panels; we'll route based on what's found
        return <GridOperatorDetailRouter slug={state.slug} />;
      case "programs":
        return <ProgramDetailPanel slug={state.slug} />;
    }
  }

  // List views — one per tab
  switch (state.tab) {
    case "utilities":
      return <UtilityListPanel />;
    case "grid-operators":
      return <GridOperatorListPanel />;
    case "power-plants":
      return <PowerPlantListPanel />;
    case "programs":
      return <ProgramListPanel />;
    case "transmission-lines":
      return <TransmissionListPanel />;
    default:
      return <UtilityListPanel />;
  }
}

// ---------------------------------------------------------------------------
// Grid operator detail router: detects ISO vs RTO vs BA from slug
// ---------------------------------------------------------------------------

import { getAllIsos, getAllRtos, getAllBalancingAuthorities } from "@/lib/data";

function GridOperatorDetailRouter({ slug }: { slug: string }) {
  const isos = getAllIsos();
  const rtos = getAllRtos();
  const bas = getAllBalancingAuthorities();

  if (isos.find((x) => x.slug === slug)) return <IsoDetailPanel slug={slug} />;
  if (rtos.find((x) => x.slug === slug)) return <RtoDetailPanel slug={slug} />;
  if (bas.find((x) => x.slug === slug)) return <BADetailPanel slug={slug} />;

  // Fallback — shouldn't happen
  return <GridOperatorListPanel />;
}
