export function Shimmer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`animate-pulse rounded bg-background-muted ${className ?? ""}`} style={style} aria-hidden="true" />
  );
}
