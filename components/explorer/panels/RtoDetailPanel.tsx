"use client";

import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRto } from "@/hooks/useRto";
import { useUtilityList } from "@/hooks/useUtilityList";
import { entityKindColor } from "@/lib/categorical-colors";
import { formatCustomerCount, formatStates, getSegmentLabel } from "@/lib/formatting";
import { safeHostname } from "@/lib/geo";
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
  >
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
);

export function RtoDetailPanel({ slug }: { slug: string }) {
  const { navigateToDetail, setHighlight } = useExplorer();
  const { user } = useCurrentUser();

  const { rto, isLoading: rtoLoading } = useRto(slug);

  useEffect(() => {
    if (!rto?.shortName) {
      setHighlight(null);
      return;
    }
    const fileKey = `iso-${rto.shortName.toLowerCase()}`;
    fetch(`/data/territories/${fileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHighlight(data as FeatureCollection | null))
      .catch(() => setHighlight(null));
    return () => setHighlight(null);
  }, [rto?.shortName, setHighlight]);

  const { utilities } = useUtilityList({ rto: rto?.slug, limit: 200 });

  if (!rto) {
    return (
      <div className="flex flex-col h-full">
        <div className="cg-explore-empty">RTO not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="cg-explore-detail">
        <div className="cg-explore-detail-type">RTO</div>
        <div className="cg-explore-detail-name">{rto.name}</div>
        <div className="cg-explore-detail-sub">
          {rto.shortName} · {formatStates(rto.states)}
        </div>

        <div className="cg-explore-kv-table">
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Short Name</span>
            <span className="cg-explore-kv-val">{rto.shortName}</span>
          </div>
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">States</span>
            <span className="cg-explore-kv-val">{formatStates(rto.states)}</span>
          </div>
          {rto.website && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Website</span>
              <span className="cg-explore-kv-val">
                <a href={rto.website} target="_blank" rel="noopener noreferrer">
                  {safeHostname(rto.website)}
                </a>
              </span>
            </div>
          )}
        </div>

        {utilities.length > 0 && (
          <>
            <div className="cg-explore-related-heading">Utilities ({utilities.length})</div>
            {utilities.slice(0, 15).map((u) => (
              <div key={u.id} className="cg-explore-related-row" onClick={() => navigateToDetail("utility", u.slug)}>
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("utilities") }} />
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
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center", marginTop: 4 }}>
                + {utilities.length - 15} more
              </div>
            )}
          </>
        )}

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
