"use client";

import { EntityVersionHistory } from "@/components/contributions/EntityVersionHistory";
import { useRate } from "@/hooks/useRate";
import { safeHostname } from "@/lib/geo";
import { useExplorer } from "../ExplorerContext";

const linkButtonStyle = {
  background: "none",
  border: 0,
  padding: 0,
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  textAlign: "left" as const,
};

function formatRateDate(value: string | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function countSchedulePeriods(schedule: unknown): number {
  if (!Array.isArray(schedule)) return 0;
  const seen = new Set<number>();
  for (const row of schedule) {
    if (!Array.isArray(row)) continue;
    for (const period of row) {
      if (typeof period === "number") seen.add(period);
    }
  }
  return seen.size;
}

function summarizeEnergyRate(rate: NonNullable<ReturnType<typeof useRate>["rate"]>): string {
  const periods = Math.max(
    countSchedulePeriods(rate.energyWeekdaySchedule),
    countSchedulePeriods(rate.energyWeekendSchedule)
  );
  if (periods > 1) return `${periods} time-of-use periods`;
  if (periods === 1) return "Flat rate";
  return rate.energyRateStructure ? "Custom energy structure" : "—";
}

function summarizeDemandRate(rate: NonNullable<ReturnType<typeof useRate>["rate"]>): string {
  if (rate.hasDemandCharge) {
    return rate.demandRateUnit ? `Demand charges (${rate.demandRateUnit})` : "Demand charges present";
  }
  return "No demand charges";
}

function summarizeNetMetering(rate: NonNullable<ReturnType<typeof useRate>["rate"]>): string {
  if (rate.hasNetMetering) return "Net metering available";
  return "No net metering";
}

function formatFixedCharge(rate: NonNullable<ReturnType<typeof useRate>["rate"]>): string {
  if (!rate.fixedCharge) return "—";
  const units = rate.fixedChargeUnits ? ` ${rate.fixedChargeUnits}` : "";
  return `${rate.fixedCharge}${units}`;
}

export function RateDetailPanel({ slug }: { slug: string }) {
  const { navigateToDetail } = useExplorer();
  const { rate } = useRate(slug);

  if (!rate) {
    return (
      <div className="flex flex-col h-full">
        <div className="cg-explore-empty">Rate not found</div>
      </div>
    );
  }

  const subtitle = [rate.utilityName, rate.sector, rate.serviceType].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col h-full">
      <div className="cg-explore-detail">
        <div className="cg-explore-detail-type">Rate / Tariff</div>
        <div className="cg-explore-detail-name">{rate.name}</div>
        {subtitle && <div className="cg-explore-detail-sub">{subtitle}</div>}

        <div className="mt-3">
          <EntityVersionHistory entityType="rate_structure" entitySlug={slug} />
        </div>

        <div className="cg-explore-kv-table">
          {rate.utilityId && rate.utilityName && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Utility</span>
              <span className="cg-explore-kv-val">
                <button
                  type="button"
                  onClick={() => navigateToDetail("utility", rate.utilityId as string)}
                  style={linkButtonStyle}
                >
                  {rate.utilityName}
                </button>
              </span>
            </div>
          )}
          {rate.sector && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Sector</span>
              <span className="cg-explore-kv-val">{rate.sector}</span>
            </div>
          )}
          {rate.serviceType && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Service Type</span>
              <span className="cg-explore-kv-val">{rate.serviceType}</span>
            </div>
          )}
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Fixed Charge</span>
            <span className="cg-explore-kv-val">{formatFixedCharge(rate)}</span>
          </div>
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Energy Rate</span>
            <span className="cg-explore-kv-val">{summarizeEnergyRate(rate)}</span>
          </div>
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Demand Charges</span>
            <span className="cg-explore-kv-val">{summarizeDemandRate(rate)}</span>
          </div>
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Net Metering</span>
            <span className="cg-explore-kv-val">{summarizeNetMetering(rate)}</span>
          </div>
          {(rate.hasTou || rate.isEvRate) && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Capabilities</span>
              <span className="cg-explore-kv-val">
                {[rate.hasTou && "Time-of-use", rate.isEvRate && "EV rate"].filter(Boolean).join(" · ")}
              </span>
            </div>
          )}
          {rate.startDate && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Effective From</span>
              <span className="cg-explore-kv-val">{formatRateDate(rate.startDate)}</span>
            </div>
          )}
          {rate.endDate && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Effective Until</span>
              <span className="cg-explore-kv-val">{formatRateDate(rate.endDate)}</span>
            </div>
          )}
          {rate.source && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Source</span>
              <span className="cg-explore-kv-val">{rate.source}</span>
            </div>
          )}
          {rate.sourceUrl && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Tariff Document</span>
              <span className="cg-explore-kv-val">
                <a href={rate.sourceUrl} target="_blank" rel="noopener noreferrer">
                  View filed tariff →
                </a>
              </span>
            </div>
          )}
          {rate.sourceParentUrl && !rate.sourceUrl && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Parent Source</span>
              <span className="cg-explore-kv-val">
                <a href={rate.sourceParentUrl} target="_blank" rel="noopener noreferrer">
                  {safeHostname(rate.sourceParentUrl)}
                </a>
              </span>
            </div>
          )}
          {rate.sourceDate && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Source Date</span>
              <span className="cg-explore-kv-val">{formatRateDate(rate.sourceDate)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
