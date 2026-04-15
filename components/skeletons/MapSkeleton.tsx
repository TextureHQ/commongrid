import { Shimmer } from "./Shimmer";

export function MapSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="relative"
    >
      <span className="sr-only">Loading map...</span>
      <Shimmer className="h-[400px] w-full rounded-lg" />
      {/* Map controls placeholder */}
      <div className="absolute right-3 top-3 space-y-2">
        <Shimmer className="h-8 w-8 rounded" />
        <Shimmer className="h-8 w-8 rounded" />
      </div>
    </div>
  );
}
