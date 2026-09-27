"use client";

import { SignInButton } from "@clerk/nextjs";
import type { FeatureCollection } from "geojson";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EntityVersionHistory } from "@/components/contributions/EntityVersionHistory";
import { useBalancingAuthority } from "@/hooks/useBalancingAuthority";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIso } from "@/hooks/useIso";
import { usePowerPlantList } from "@/hooks/usePowerPlantList";
import { useProgramList } from "@/hooks/useProgramList";
import { useRateList } from "@/hooks/useRateList";
import { useRto } from "@/hooks/useRto";
import { useUtility } from "@/hooks/useUtility";
import { useUtilityList } from "@/hooks/useUtilityList";
import { entityKindColor } from "@/lib/categorical-colors";
import { getRegionById } from "@/lib/data";
import {
  formatCapacity,
  formatCustomerCount,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getSegmentLabel,
  getStatusLabel,
} from "@/lib/formatting";
import { safeHostname } from "@/lib/geo";
import { buildNewProgramHref } from "@/lib/programs/new-program-link";
import { getProgramMapCategoryLabel, summarizePrograms } from "@/lib/programs/program-category";
import { useExplorer } from "../ExplorerContext";

const ArrowIcon = () => (
  <svg
    className="cg-explore-arrow"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
    focusable="false"
    role="presentation"
  >
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
);

export function UtilityDetailPanel({ slug }: { slug: string }) {
  const { navigateToDetail, setHighlight } = useExplorer();
  const { user } = useCurrentUser();

  const { utility } = useUtility(slug);
  const { utilities, isLoading: utilitiesLoading } = useUtilityList({ limit: 500 });

  const { iso } = useIso(utility?.isoId ?? null);
  const { rto } = useRto(utility?.rtoId ?? null);
  const { balancingAuthority: ba } = useBalancingAuthority(utility?.balancingAuthorityId ?? null);
  const parent = useMemo(
    () => (utility?.parentId ? (utilities.find((u) => u.id === utility.parentId) ?? null) : null),
    [utility, utilities]
  );
  const successor = useMemo(
    () => (utility?.successorId ? (utilities.find((u) => u.id === utility.successorId) ?? null) : null),
    [utility, utilities]
  );

  const region = useMemo(
    () => (utility?.serviceTerritoryId ? getRegionById(utility.serviceTerritoryId) : null),
    [utility]
  );

  const territoryFileKey = useMemo(() => {
    if (!region) return null;
    if (region.type === "CCA_TERRITORY" || region.type === "ISO" || region.type === "CUSTOM") {
      return region.slug;
    }
    return region.eiaId;
  }, [region]);

  // Load territory GeoJSON and send to map for highlighting
  useEffect(() => {
    if (!territoryFileKey) {
      setHighlight(null);
      return;
    }
    fetch(`/data/territories/${territoryFileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setHighlight(data as FeatureCollection | null);
      })
      .catch(() => setHighlight(null));

    return () => setHighlight(null);
  }, [territoryFileKey, setHighlight]);

  const childUtilities = useMemo(
    () => (utility ? utilities.filter((u) => u.parentId === utility.id) : []),
    [utility, utilities]
  );

  const { powerPlants: utilityPowerPlants } = usePowerPlantList({
    utilityId: utility?.id,
    limit: 200,
  });

  const { rates: utilityRates } = useRateList({
    utilityId: utility?.id,
    limit: 200,
    enabled: !!utility?.id,
  });

  const [ratesExpanded, setRatesExpanded] = useState(false);
  const ratesToShow = ratesExpanded ? utilityRates : utilityRates.slice(0, 15);

  const { programs: utilityPrograms, isLoading: utilityProgramsLoading } = useProgramList({
    organization: utility?.slug,
    limit: 200,
    sort: "name",
    order: "asc",
    fields: "slug,name,assetTypes,mapCategory,organizations,capacityTarget,maxEnrollments",
    enabled: !!utility?.slug,
  });
  const programTotals = useMemo(() => summarizePrograms(utilityPrograms), [utilityPrograms]);

  if (utilitiesLoading) {
    return <div className="cg-explore-loading">Loading…</div>;
  }

  if (!utility) {
    return (
      <div className="flex flex-col h-full">
        <div className="cg-explore-empty">Utility not found</div>
      </div>
    );
  }

  const hasGridRelationships = iso || rto || ba;

  return (
    <div className="flex flex-col h-full">
      <div className="cg-explore-detail">
        {utility.logo && (
          <div className="cg-explore-detail-logo">
            <Image src={utility.logo} alt={`${utility.name} logo`} width={64} height={64} unoptimized />
          </div>
        )}
        <div className="cg-explore-detail-type">Utility</div>
        <div className="cg-explore-detail-name">{utility.name}</div>
        <div className="cg-explore-detail-sub">
          {getSegmentLabel(utility.segment)} · {formatCustomerCount(utility.customerCount)} customers ·{" "}
          {getStatusLabel(utility.status)}
        </div>

        <div className="mt-3">
          <EntityVersionHistory entityType="utility" entitySlug={slug} />
        </div>

        <div className="cg-explore-kv-table">
          {utility.jurisdiction && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Jurisdiction</span>
              <span className="cg-explore-kv-val">{utility.jurisdiction}</span>
            </div>
          )}
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Segment</span>
            <span className="cg-explore-kv-val">{getSegmentLabel(utility.segment)}</span>
          </div>
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Customers</span>
            <span className="cg-explore-kv-val">{formatCustomerCount(utility.customerCount)}</span>
          </div>
          {utility.eiaId && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">EIA ID</span>
              <span className="cg-explore-kv-val">{utility.eiaId}</span>
            </div>
          )}
          {utility.website && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Website</span>
              <span className="cg-explore-kv-val">
                <a href={utility.website} target="_blank" rel="noopener noreferrer">
                  {safeHostname(utility.website)}
                </a>
              </span>
            </div>
          )}
          {utility.peakDemandMw !== null && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Summer Peak</span>
              <span className="cg-explore-kv-val">{utility.peakDemandMw.toLocaleString()} MW</span>
            </div>
          )}
          {utility.nercRegion && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">NERC Region</span>
              <span className="cg-explore-kv-val">{utility.nercRegion}</span>
            </div>
          )}
        </div>

        {hasGridRelationships && (
          <>
            <div className="cg-explore-related-heading">Related</div>
            {iso && (
              <button
                type="button"
                className="cg-explore-related-row"
                onClick={() => navigateToDetail("iso", iso.slug)}
              >
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("grid-operators") }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{iso.shortName}</div>
                  <div className="cg-explore-related-type">ISO</div>
                </div>
                <ArrowIcon />
              </button>
            )}
            {rto && (
              <button
                type="button"
                className="cg-explore-related-row"
                onClick={() => navigateToDetail("rto", rto.slug)}
              >
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("grid-operators") }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{rto.shortName}</div>
                  <div className="cg-explore-related-type">RTO</div>
                </div>
                <ArrowIcon />
              </button>
            )}
            {ba && (
              <button type="button" className="cg-explore-related-row" onClick={() => navigateToDetail("ba", ba.slug)}>
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("grid-operators") }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{ba.shortName}</div>
                  <div className="cg-explore-related-type">Balancing Authority</div>
                </div>
                <ArrowIcon />
              </button>
            )}
          </>
        )}

        {(parent || successor) && (
          <>
            {!hasGridRelationships && <div className="cg-explore-related-heading">Related</div>}
            {parent && (
              <button
                type="button"
                className="cg-explore-related-row"
                onClick={() => navigateToDetail("utility", parent.slug)}
              >
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("utilities") }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{parent.name}</div>
                  <div className="cg-explore-related-type">Parent</div>
                </div>
                <ArrowIcon />
              </button>
            )}
            {successor && (
              <button
                type="button"
                className="cg-explore-related-row"
                onClick={() => navigateToDetail("utility", successor.slug)}
              >
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("utilities") }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{successor.name}</div>
                  <div className="cg-explore-related-type">Successor</div>
                </div>
                <ArrowIcon />
              </button>
            )}
          </>
        )}

        {childUtilities.length > 0 && (
          <>
            <div className="cg-explore-related-heading" style={{ marginTop: 16 }}>
              Subsidiaries ({childUtilities.length})
            </div>
            {childUtilities.slice(0, 15).map((child) => (
              <button
                key={child.id}
                type="button"
                className="cg-explore-related-row"
                onClick={() => navigateToDetail("utility", child.slug)}
              >
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("utilities") }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{child.name}</div>
                  <div className="cg-explore-related-type">
                    {getSegmentLabel(child.segment)} · {formatCustomerCount(child.customerCount)} customers
                  </div>
                </div>
                <ArrowIcon />
              </button>
            ))}
            {childUtilities.length > 15 && (
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center", marginTop: 4 }}>
                + {childUtilities.length - 15} more
              </div>
            )}
          </>
        )}

        {utilityPowerPlants.length > 0 && (
          <>
            <div className="cg-explore-related-heading" style={{ marginTop: 16 }}>
              Power Plants ({utilityPowerPlants.length})
            </div>
            {utilityPowerPlants.slice(0, 15).map((plant) => (
              <Link
                key={plant.id}
                href={`/power-plants/${plant.slug}`}
                className="cg-explore-related-row"
                style={{ textDecoration: "none" }}
              >
                <span
                  className="cg-explore-related-dot"
                  style={{ background: getFuelCategoryColor(plant.fuelCategory), borderRadius: "50%" }}
                />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{plant.name}</div>
                  <div className="cg-explore-related-type">
                    {getFuelCategoryLabel(plant.fuelCategory)} · {formatCapacity(plant.totalCapacityMw)}
                  </div>
                </div>
                <ArrowIcon />
              </Link>
            ))}
            {utilityPowerPlants.length > 15 && (
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center", marginTop: 4 }}>
                + {utilityPowerPlants.length - 15} more
              </div>
            )}
          </>
        )}

        {utilityRates.length > 0 && (
          <>
            <div className="cg-explore-related-heading" style={{ marginTop: 16 }}>
              Rates ({utilityRates.length})
            </div>
            {ratesToShow.map((rate) => (
              <button
                key={rate.id}
                type="button"
                className="cg-explore-related-row"
                onClick={() => navigateToDetail("rate", rate.slug)}
              >
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("rates") }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{rate.name}</div>
                  <div className="cg-explore-related-type">
                    {[rate.sector, rate.serviceType].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <ArrowIcon />
              </button>
            ))}
            {utilityRates.length > 15 && (
              <button
                type="button"
                onClick={() => setRatesExpanded((prev) => !prev)}
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  textAlign: "center",
                  marginTop: 4,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                {ratesExpanded ? "Show fewer" : `+ ${utilityRates.length - 15} more`}
              </button>
            )}
          </>
        )}
        {utilityRates.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 16, marginBottom: 6 }}>
            No rates on file for this utility yet.
          </div>
        )}

        <div className="cg-explore-programs-section">
          <div
            className="cg-explore-related-heading"
            style={{ marginTop: 16, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}
          >
            <span>Programs ({programTotals.programCount})</span>
            {user ? (
              <Link
                href={buildNewProgramHref(utility.slug)}
                style={{ fontSize: 11, fontWeight: 500, color: "var(--color-brand-primary)" }}
              >
                + Add a program
              </Link>
            ) : (
              <SignInButton mode="modal" forceRedirectUrl={buildNewProgramHref(utility.slug)}>
                <button
                  type="button"
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--color-brand-primary)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  + Add a program
                </button>
              </SignInButton>
            )}
          </div>
          {utilityProgramsLoading && (
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>Loading programs…</div>
          )}
          {!utilityProgramsLoading && utilityPrograms.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>
              No programs on file for this utility yet.
            </div>
          )}
          {!utilityProgramsLoading && utilityPrograms.length > 0 && (
            <div className="cg-explore-kv-table" style={{ marginTop: 8, marginBottom: 8 }}>
              <div className="cg-explore-kv-row">
                <span className="cg-explore-kv-key">Programs</span>
                <span className="cg-explore-kv-val">{programTotals.programCount.toLocaleString()}</span>
              </div>
              <div className="cg-explore-kv-row">
                <span className="cg-explore-kv-key">Capacity Target</span>
                <span className="cg-explore-kv-val">
                  {programTotals.capacityTargetMw > 0 ? formatCapacity(programTotals.capacityTargetMw) : "—"}
                </span>
              </div>
              <div className="cg-explore-kv-row">
                <span className="cg-explore-kv-key">Max Enrollments</span>
                <span className="cg-explore-kv-val">
                  {programTotals.maxEnrollments > 0 ? programTotals.maxEnrollments.toLocaleString() : "—"}
                </span>
              </div>
              <div className="cg-explore-kv-row">
                <span className="cg-explore-kv-key">Map Categories</span>
                <span className="cg-explore-kv-val">
                  {Object.entries(programTotals.categoryCounts)
                    .filter(([, count]) => count > 0)
                    .map(
                      ([category, count]) =>
                        `${getProgramMapCategoryLabel(category as Parameters<typeof getProgramMapCategoryLabel>[0])} (${count})`
                    )
                    .join(", ") || "—"}
                </span>
              </div>
            </div>
          )}
          {utilityPrograms.slice(0, 15).map((prog) => (
            <button
              key={prog.slug}
              type="button"
              className="cg-explore-related-row"
              onClick={() => navigateToDetail("program", prog.slug)}
            >
              <span className="cg-explore-related-dot" style={{ background: entityKindColor("programs") }} />
              <div style={{ flex: 1 }}>
                <div className="cg-explore-related-name">{prog.name}</div>
                <div className="cg-explore-related-type">
                  {getProgramMapCategoryLabel(prog.mapCategory ?? prog.assetTypes[0] ?? "NON_DEVICE")}
                </div>
              </div>
              <ArrowIcon />
            </button>
          ))}
          {utilityPrograms.length > 15 && (
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center", marginTop: 4 }}>
              + {utilityPrograms.length - 15} more
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 7, marginTop: 16 }}>
          <Link
            href={`/grid-operators/${slug}`}
            className="cg-explore-fullpage-link"
            style={{ textDecoration: "none" }}
          >
            Full page →
          </Link>
        </div>
      </div>
    </div>
  );
}
