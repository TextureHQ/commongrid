import { Shimmer } from "./Shimmer";

export function EntityDetailSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <span className="sr-only">Loading details...</span>
      <div className="space-y-5">
        <div className="space-y-2">
          <Shimmer className="h-4 w-20" />
          <Shimmer className="h-8 w-64" />
          <Shimmer className="h-4 w-96 max-w-full" />
        </div>

        <div className="space-y-3 rounded-xl border border-border-default bg-background-surface p-4">
          <div className="flex items-center gap-2">
            <Shimmer className="h-4 w-16" />
            <Shimmer className="h-4 w-24" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder, never reorders
              <div key={`field-${i}`} className="space-y-1.5 rounded-lg border border-border-default p-3">
                <Shimmer className="h-3 w-20" />
                <Shimmer className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Shimmer className="h-4 w-28" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder, never reorders
              <div key={`related-${i}`} className="flex items-center gap-3 rounded-lg border border-border-default p-3">
                <Shimmer className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Shimmer className="h-4 w-40" />
                  <Shimmer className="h-3 w-24" />
                </div>
                <Shimmer className="h-4 w-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
