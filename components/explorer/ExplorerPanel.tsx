"use client";

import { type EntityTab, useExplorer } from "./ExplorerContext";
import { BADetailPanel } from "./panels/BADetailPanel";
import { EVChargingListPanel } from "./panels/EVChargingListPanel";
import { GridOperatorListPanel } from "./panels/GridOperatorListPanel";
import { IsoDetailPanel } from "./panels/IsoDetailPanel";
import { OverviewPanel } from "./panels/OverviewPanel";
import { PowerPlantListPanel } from "./panels/PowerPlantListPanel";
import { PricingNodeListPanel } from "./panels/PricingNodeListPanel";
import { ProgramDetailPanel } from "./panels/ProgramDetailPanel";
import { ProgramListPanel } from "./panels/ProgramListPanel";
import { RtoDetailPanel } from "./panels/RtoDetailPanel";
import { SubstationListPanel } from "./panels/SubstationListPanel";
import { TransmissionListPanel } from "./panels/TransmissionListPanel";
import { UtilityDetailPanel } from "./panels/UtilityDetailPanel";
import { UtilityListPanel } from "./panels/UtilityListPanel";

interface ExplorerPanelProps {
  // In map view, listSource overrides state.tab to control which list is shown.
  // In list view, leave undefined and the tab bar controls it via state.tab.
  listSource?: EntityTab;
}

export function ExplorerPanel({ listSource }: ExplorerPanelProps = {}) {
  const { state } = useExplorer();

  // Overview is the stack root — shows the top-level entity buckets.
  if (state.mode === "overview") {
    return <OverviewPanel />;
  }

  // activeTab: use listSource (map view) or state.tab (list view)
  const activeTab = listSource ?? state.tab;

  // Detail views (slug-based, activeTab tells us entity type context)
  if (state.mode === "detail" && state.slug) {
    switch (activeTab) {
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

  // List views — one per activeTab
  switch (activeTab) {
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
    case "ev-charging":
      return <EVChargingListPanel />;
    case "pricing-nodes":
      return <PricingNodeListPanel />;
    case "substations":
      return <SubstationListPanel />;
    default:
      return <UtilityListPanel />;
  }
}

// ---------------------------------------------------------------------------
// Grid operator detail router: detects ISO vs RTO vs BA from slug
// ---------------------------------------------------------------------------

import { getAllBalancingAuthorities, getAllIsos, getAllRtos } from "@/lib/data";

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
