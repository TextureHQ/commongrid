"use client";

import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { useEffect } from "react";
import { EntityVersionHistory } from "@/components/contributions/EntityVersionHistory";
import { useBalancingAuthorityList } from "@/hooks/useBalancingAuthorityList";
import { useIso } from "@/hooks/useIso";
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

export function IsoDetailPanel({ slug }: { slug: string }) {
  const { navigateToDetail, setHighlight } = useExplorer();

  const { iso } = useIso(slug);

  useEffect(() => {
    if (!iso?.shortName) {
      setHighlight(null);
      return;
    }
    const fileKey = `iso-${iso.shortName.toLowerCase()}`;
    fetch(`/data/territories/${fileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHighlight(data as FeatureCollection | null))
      .catch(() => setHighlight(null));
    return () => setHighlight(null);
  }, [iso?.shortName, setHighlight]);

  const { utilities } = useUtilityList({ iso: iso?.slug, limit: 200 });
  const { balancingAuthorities } = useBalancingAuthorityList({ isoId: iso?.id });

  if (!iso) {
    return (
      <div className="flex flex-col h-full">
        <div className="cg-explore-empty">ISO not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="cg-explore-detail">
        <div className="cg-explore-detail-type">ISO</div>
        <div className="cg-explore-detail-name">{iso.name}</div>
        <div className="cg-explore-detail-sub">
          {iso.shortName} · {formatStates(iso.states)}
        </div>

        <div className="mt-3">
          <EntityVersionHistory entityType="iso" entitySlug={slug} />
        </div>

        <div className="cg-explore-kv-table">
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Short Name</span>
            <span className="cg-explore-kv-val">{iso.shortName}</span>
          </div>
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">States</span>
            <span className="cg-explore-kv-val">{formatStates(iso.states)}</span>
          </div>
          {iso.website && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Website</span>
              <span className="cg-explore-kv-val">
                <a href={iso.website} target="_blank" rel="noopener noreferrer">
                  {safeHostname(iso.website)}
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

        {/* Balancing Authorities */}
        {balancingAuthorities.length > 0 && (
          <>
            <div className="cg-explore-related-heading" style={{ marginTop: 16 }}>
              Balancing Authorities ({balancingAuthorities.length})
            </div>
            {balancingAuthorities.map((ba) => (
              <div key={ba.id} className="cg-explore-related-row" onClick={() => navigateToDetail("ba", ba.slug)}>
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("grid-operators") }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{ba.name}</div>
                  <div className="cg-explore-related-type">
                    {ba.shortName}
                    {ba.eiaCode ? ` · ${ba.eiaCode}` : ""}
                  </div>
                </div>
                <ArrowIcon />
              </div>
            ))}
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
