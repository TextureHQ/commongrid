"use client";

import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getBalancingAuthorityBySlug, getIsoById } from "@/lib/data";
import {
  formatCapacity,
  formatCustomerCount,
  formatStates,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getSegmentLabel,
} from "@/lib/formatting";
import { safeHostname } from "@/lib/geo";
import { filterByBA, usePowerPlants } from "@/lib/power-plants";
import { useUtilities } from "@/lib/utilities-client";
import { useExplorer } from "../ExplorerContext";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5m5-5-5 5 5 5" />
  </svg>
);

const ArrowIcon = () => (
  <svg
    className="cg-explore-arrow"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
);

export function BADetailPanel({ slug }: { slug: string }) {
  const { navigateToDetail, goBack, setHighlight } = useExplorer();
  const { user } = useCurrentUser();

  const ba = getBalancingAuthorityBySlug(slug);
  const iso = ba?.isoId ? getIsoById(ba.isoId) : null;

  useEffect(() => {
    if (!ba?.regionId) {
      setHighlight(null);
      return;
    }
    fetch(`/data/territories/ba-${ba.slug}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHighlight(data as FeatureCollection | null))
      .catch(() => setHighlight(null));
    return () => setHighlight(null);
  }, [ba?.slug, ba?.regionId, setHighlight]);

  const { utilities: allUtilities } = useUtilities();
  const utilities = useMemo(
    () => (ba ? allUtilities.filter((u) => u.balancingAuthorityId === ba.id) : []),
    [ba, allUtilities]
  );
  const { plants: allPlants } = usePowerPlants();
  const baPowerPlants = useMemo(() => (ba ? filterByBA(allPlants, ba.id) : []), [ba, allPlants]);

  if (!ba) {
    return (
      <div className="flex flex-col h-full">
        <div className="cg-explore-breadcrumb">
          <button type="button" className="cg-explore-breadcrumb-back" onClick={goBack}>
            <BackIcon /> Back
          </button>
        </div>
        <div className="cg-explore-empty">Balancing Authority not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="cg-explore-breadcrumb">
        <button type="button" className="cg-explore-breadcrumb-back" onClick={goBack}>
          <BackIcon /> Grid Operators
        </button>
        <span className="cg-explore-breadcrumb-sep">/</span>
        <span className="cg-explore-breadcrumb-current">{ba.shortName}</span>
      </div>

      <div className="cg-explore-detail">
        <div className="cg-explore-detail-type">Balancing Authority</div>
        <div className="cg-explore-detail-name">{ba.name}</div>
        <div className="cg-explore-detail-sub">
          {ba.shortName} · {formatStates(ba.states)}
        </div>

        <div className="cg-explore-kv-table">
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Short Name</span>
            <span className="cg-explore-kv-val">{ba.shortName}</span>
          </div>
          {ba.eiaCode && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">EIA Code</span>
              <span className="cg-explore-kv-val">{ba.eiaCode}</span>
            </div>
          )}
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">States</span>
            <span className="cg-explore-kv-val">{formatStates(ba.states)}</span>
          </div>
          {iso && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">ISO</span>
              <span className="cg-explore-kv-val">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateToDetail("iso", iso.slug);
                  }}
                >
                  {iso.shortName}
                </a>
              </span>
            </div>
          )}
          {ba.website && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Website</span>
              <span className="cg-explore-kv-val">
                <a href={ba.website} target="_blank" rel="noopener noreferrer">
                  {safeHostname(ba.website)}
                </a>
              </span>
            </div>
          )}
        </div>

        {/* Utilities */}
        {utilities.length > 0 && (
          <>
            <div className="cg-explore-related-heading">Utilities ({utilities.length})</div>
            {utilities.slice(0, 15).map((u) => (
              <div key={u.id} className="cg-explore-related-row" onClick={() => navigateToDetail("utility", u.slug)}>
                <span className="cg-explore-related-dot" style={{ background: "var(--cg-teal)" }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{u.name}</div>
                  <div className="cg-explore-related-type">
                    {getSegmentLabel(u.segment)} · {formatCustomerCount(u.customerCount)}
                  </div>
                </div>
                <ArrowIcon />
              </div>
            ))}
            {utilities.length > 15 && (
              <div style={{ fontSize: 11, color: "var(--cg-muted)", textAlign: "center", marginTop: 4 }}>
                + {utilities.length - 15} more
              </div>
            )}
          </>
        )}

        {/* Power Plants */}
        {baPowerPlants.length > 0 && (
          <>
            <div className="cg-explore-related-heading" style={{ marginTop: 16 }}>
              Power Plants ({baPowerPlants.length})
            </div>
            {baPowerPlants.slice(0, 15).map((plant) => (
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
            {baPowerPlants.length > 15 && (
              <div style={{ fontSize: 11, color: "var(--cg-muted)", textAlign: "center", marginTop: 4 }}>
                + {baPowerPlants.length - 15} more
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 7, marginTop: 16 }}>
          <Link
            href={`/balancing-authorities/${slug}`}
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
