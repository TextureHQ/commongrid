"use client";

import { useExplorer, type LayoutMode } from "./ExplorerContext";

interface ToggleOption {
  id: LayoutMode;
  label: string;
  icon: React.ReactNode;
}

function MapIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path
        fillRule="evenodd"
        d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.575a.75.75 0 0 1-1.12.814L8 11.438l-3.136 2.556a.75.75 0 0 1-1.12-.814l.853-3.575-2.79-2.39a.75.75 0 0 1 .427-1.317l3.663-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path
        fillRule="evenodd"
        d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function HybridIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v2A1.5 1.5 0 0 0 1.5 8h5A1.5 1.5 0 0 0 8 6.5v-2A1.5 1.5 0 0 0 6.5 3h-5ZM1.5 9A1.5 1.5 0 0 0 0 10.5v1A1.5 1.5 0 0 0 1.5 13h5A1.5 1.5 0 0 0 8 11.5v-1A1.5 1.5 0 0 0 6.5 9h-5ZM9.5 3A1.5 1.5 0 0 0 8 4.5v7A1.5 1.5 0 0 0 9.5 13h5a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 3h-5Z" />
    </svg>
  );
}

const OPTIONS: ToggleOption[] = [
  { id: "map", label: "Map", icon: <MapIcon /> },
  { id: "list", label: "List", icon: <ListIcon /> },
  { id: "hybrid", label: "Hybrid", icon: <HybridIcon /> },
];

export function ExplorerToolbar() {
  const { state, setLayout } = useExplorer();

  return (
    <div className="flex items-center gap-1 px-4 py-2 flex-shrink-0">
      <div className="flex items-center rounded-lg border border-border-default bg-background-default p-0.5 gap-0.5">
        {OPTIONS.map((opt) => {
          const isActive = state.layout === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setLayout(opt.id)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors
                ${
                  isActive
                    ? "bg-background-surface text-text-heading shadow-sm"
                    : "text-text-muted hover:text-text-body"
                }
              `}
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
