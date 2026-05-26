/**
 * PortDisplay - Visual display for EV charging ports
 *
 * Shows Level 1, Level 2, and DC Fast charging counts in a 3-column grid.
 * Maintains layout on mobile for easy comparison.
 */
interface PortDisplayProps {
  /** Level 1 port count */
  level1Count: number;
  /** Level 2 port count */
  level2Count: number;
  /** DC Fast port count */
  dcFastCount: number;
}

export function PortDisplay({ level1Count, level2Count, dcFastCount }: PortDisplayProps) {
  return (
    <div className="grid grid-cols-3 gap-6 py-6">
      <div className="flex flex-col items-center text-center">
        <div className="text-4xl md:text-5xl font-bold text-text-heading tabular-nums">{level1Count}</div>
        <div className="text-sm font-medium text-text-body mt-2">Level 1</div>
        <div className="text-xs text-text-muted mt-1">120V</div>
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="text-4xl md:text-5xl font-bold text-text-heading tabular-nums">{level2Count}</div>
        <div className="text-sm font-medium text-text-body mt-2">Level 2</div>
        <div className="text-xs text-text-muted mt-1">240V</div>
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="text-4xl md:text-5xl font-bold text-text-heading tabular-nums">{dcFastCount}</div>
        <div className="text-sm font-medium text-text-body mt-2">DC Fast</div>
        <div className="text-xs text-text-muted mt-1">480V+</div>
      </div>
    </div>
  );
}
