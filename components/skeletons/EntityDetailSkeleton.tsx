import { Shimmer } from "./Shimmer";

export function EntityDetailSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <span className="sr-only">Loading details...</span>
      <div className="space-y-6">
        {/* Title area */}
        <div className="space-y-2">
          <Shimmer className="h-8 w-64" />
          <Shimmer className="h-4 w-96" />
        </div>
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`stat-${i}`}
              className="space-y-2 rounded-lg border border-border-default p-4"
            >
              <Shimmer className="h-3 w-20" />
              <Shimmer className="h-6 w-16" />
            </div>
          ))}
        </div>
        {/* Content area */}
        <div className="space-y-3">
          <Shimmer className="h-4 w-full" />
          <Shimmer className="h-4 w-5/6" />
          <Shimmer className="h-4 w-4/6" />
          <Shimmer className="h-4 w-full" />
          <Shimmer className="h-4 w-3/6" />
        </div>
      </div>
    </div>
  );
}
