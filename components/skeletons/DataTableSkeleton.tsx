import { Shimmer } from "./Shimmer";

interface DataTableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function DataTableSkeleton({
  rows = 10,
  columns = 4,
}: DataTableSkeletonProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <span className="sr-only">Loading data...</span>
      <div className="space-y-3">
        {/* Header row */}
        <div className="flex gap-4 border-b border-border-default pb-2">
          {Array.from({ length: columns }).map((_, i) => (
            <Shimmer key={`header-${i}`} className="h-4 flex-1" />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={`row-${rowIdx}`} className="flex gap-4 py-2">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Shimmer
                key={`cell-${rowIdx}-${colIdx}`}
                className={`h-4 flex-1 ${colIdx === 0 ? "max-w-[200px]" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
