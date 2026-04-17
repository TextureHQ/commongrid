"use client";

import { type EntityTab, useExplorer } from "./ExplorerContext";

interface TabDef {
  id: EntityTab;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}

function UtilityIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-9ZM5 5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5Zm0 2.5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5Zm0 2.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H5Z" />
    </svg>
  );
}

function GridOpsIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path
        fillRule="evenodd"
        d="M8 1a.75.75 0 0 1 .75.75V6h3.5a.75.75 0 0 1 0 1.5H8.75v4.75a.75.75 0 0 1-1.5 0V7.5H3.75a.75.75 0 0 1 0-1.5h3.5V1.75A.75.75 0 0 1 8 1ZM1 13.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1-.75-.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PowerPlantIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
      <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
    </svg>
  );
}

function ProgramIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 1.5 1.5v1A1.5 1.5 0 0 1 9 6H7a1.5 1.5 0 0 1-1.5-1.5v-1ZM3.75 5A.75.75 0 0 0 3 5.75v7.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-7.5A.75.75 0 0 0 12.25 5h-.5v.75a3 3 0 0 1-3 3h-1.5a3 3 0 0 1-3-3V5h-.5ZM6.5 9a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Zm0 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z" />
    </svg>
  );
}

function TransmissionIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path
        fillRule="evenodd"
        d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75ZM1 8a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 8Zm0 5.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1-.75-.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function EVChargingIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path d="M11.25 2.5a.75.75 0 0 0-1.5 0v2.25H7.5V2.5a.75.75 0 0 0-1.5 0v2.25h-.5A1.5 1.5 0 0 0 4 6.25v5.5A1.5 1.5 0 0 0 5.5 13h4a1.5 1.5 0 0 0 1.5-1.5v-5.5a1.5 1.5 0 0 0-1.5-1.5h-.5V2.5ZM6.75 10a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm0-2.5a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1A.75.75 0 0 1 6.75 7.5Z" />
      <path d="M12.5 7a.5.5 0 0 1 .5.5v3a.5.5 0 0 0 .5.5h.25a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25H13.5a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5h.5a.5.5 0 0 1 0 1h-.5Z" />
    </svg>
  );
}

function PricingNodeIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path
        fillRule="evenodd"
        d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2ZM4.5 8a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5Z"
        clipRule="evenodd"
      />
      <path d="M8 4.75a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5A.75.75 0 0 1 8 4.75Z" />
    </svg>
  );
}

const TABS: TabDef[] = [
  { id: "utilities", label: "Utilities", shortLabel: "Utilities", icon: <UtilityIcon /> },
  { id: "grid-operators", label: "Grid Operators", shortLabel: "Grid Ops", icon: <GridOpsIcon /> },
  { id: "power-plants", label: "Power Plants", shortLabel: "Plants", icon: <PowerPlantIcon /> },
  { id: "programs", label: "Programs", shortLabel: "Programs", icon: <ProgramIcon /> },
  { id: "transmission-lines", label: "Transmission", shortLabel: "Lines", icon: <TransmissionIcon /> },
  { id: "ev-charging", label: "EV Charging", shortLabel: "EV", icon: <EVChargingIcon /> },
  { id: "pricing-nodes", label: "Pricing Nodes", shortLabel: "Nodes", icon: <PricingNodeIcon /> },
];

export function ExplorerTabBar() {
  const { state, navigateToTab } = useExplorer();

  return (
    <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide px-2 md:px-4">
      {TABS.map((tab) => {
        const isActive = state.tab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigateToTab(tab.id)}
            className={`
              flex items-center gap-1.5 px-3 py-3.5 text-sm font-medium whitespace-nowrap
              border-b-2 transition-colors flex-shrink-0
              ${
                isActive
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-text-muted hover:text-text-body hover:border-border-default"
              }
            `}
          >
            <span className={isActive ? "text-brand-primary" : "text-text-muted"}>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
