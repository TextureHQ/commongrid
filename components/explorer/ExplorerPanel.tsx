"use client";

import { useExplorer } from "./ExplorerContext";
import { UtilityListPanel } from "./panels/UtilityListPanel";
import { GridOperatorListPanel } from "./panels/GridOperatorListPanel";
import { ProgramListPanel } from "./panels/ProgramListPanel";
import { UtilityDetailPanel } from "./panels/UtilityDetailPanel";
import { IsoDetailPanel } from "./panels/IsoDetailPanel";
import { RtoDetailPanel } from "./panels/RtoDetailPanel";
import { BADetailPanel } from "./panels/BADetailPanel";
import { ProgramDetailPanel } from "./panels/ProgramDetailPanel";

export function ExplorerPanel() {
  const { state } = useExplorer();

  switch (state.view) {
    case "grid-operators":
      return <GridOperatorListPanel />;
    case "programs":
      return <ProgramListPanel />;
    case "utility":
      return state.slug ? <UtilityDetailPanel slug={state.slug} /> : <UtilityListPanel />;
    case "iso":
      return state.slug ? <IsoDetailPanel slug={state.slug} /> : <UtilityListPanel />;
    case "rto":
      return state.slug ? <RtoDetailPanel slug={state.slug} /> : <UtilityListPanel />;
    case "ba":
      return state.slug ? <BADetailPanel slug={state.slug} /> : <UtilityListPanel />;
    case "program":
      return state.slug ? <ProgramDetailPanel slug={state.slug} /> : <ProgramListPanel />;
    case "utilities":
    default:
      return <UtilityListPanel />;
  }
}
