import { Kpi, type KpiProps, KpiGroup } from "@texturehq/edges";

/**
 * Stat item for EntityStatsRow.
 *
 * Two shapes are supported:
 *   - Raw + formatter (preferred): `{ value: number | null, label, formatter }`
 *     The formatter (an edges `ComponentFormatter`, typically a `(n) => string`
 *     function) renders the number. Null values are filtered out automatically.
 *   - Pre-formatted (back-compat): `{ value: string | ReactNode, label }`
 *     The string is passed straight to Kpi. Use this only when the value isn't
 *     a number (e.g. status text), not for numeric metrics.
 */
export type EntityStat = {
  label: string;
} & (
  | { value: number | null | undefined; formatter: KpiProps["formatter"] }
  | { value: string | React.ReactNode; formatter?: never }
);

interface EntityStatsRowProps {
  stats: EntityStat[];
}

function isNullish(value: unknown): boolean {
  return value === null || value === undefined || value === "" || value === "—";
}

export function EntityStatsRow({ stats }: EntityStatsRowProps) {
  const filtered = stats.filter((stat) => !isNullish(stat.value));

  if (filtered.length === 0) return null;

  return (
    <div className="py-8 border-b border-border-default">
      <KpiGroup cols={{ base: 1, sm: 2, md: filtered.length === 3 ? 3 : 4 }} gap="lg">
        {filtered.map((stat) => {
          if (stat.formatter !== undefined) {
            return <Kpi key={stat.label} label={stat.label} value={stat.value as number} formatter={stat.formatter} />;
          }
          const v = stat.value;
          return <Kpi key={stat.label} label={stat.label} value={typeof v === "number" ? v : String(v)} />;
        })}
      </KpiGroup>
    </div>
  );
}
