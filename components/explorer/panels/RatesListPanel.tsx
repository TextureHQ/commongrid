"use client";

export function RatesListPanel() {
  return (
    <div className="flex flex-col h-full bg-background-surface">
      <div className="p-4 border-b border-border-default">
        <h2 className="text-lg font-medium text-text-heading">Rates & Tariffs</h2>
        <p className="text-sm text-text-muted mt-1">
          Coming soon: an open repository of residential and commercial rate structures.
        </p>
      </div>
      <div className="flex-1 overflow-auto p-4 text-sm text-text-muted">
        This view is under active development. Check back later for structured tariff data.
      </div>
    </div>
  );
}
