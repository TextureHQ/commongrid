import { Shimmer } from "./Shimmer";

interface FiltersSkeletonProps {
  count?: number;
}

export function FiltersSkeleton({ count = 4 }: FiltersSkeletonProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <span className="sr-only">Loading filters...</span>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: count }).map((_, i) => (
          <Shimmer
            key={`filter-${i}`}
            className="h-9 rounded-full"
            style={{ width: `${80 + i * 20}px` }}
          />
        ))}
      </div>
    </div>
  );
}
