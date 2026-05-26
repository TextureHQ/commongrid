import { Loader } from "@texturehq/edges";

/**
 * EntityMap - Map wrapper with loading state
 *
 * Provides consistent container styling and aspect ratios.
 * Taller on mobile (16:10), wider on desktop (21:9).
 */
interface EntityMapProps {
  /** Show loading overlay */
  loading?: boolean;
  /** Map component (InteractiveMap) */
  children: React.ReactNode;
}

export function EntityMap({ loading, children }: EntityMapProps) {
  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-border-default aspect-[16/10] md:aspect-[21/9]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background-body z-10">
          <Loader size={32} />
        </div>
      )}
      <div className="w-full h-full">{children}</div>
    </div>
  );
}
