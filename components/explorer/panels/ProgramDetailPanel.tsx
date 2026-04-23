"use client";

import type { FeatureCollection } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { EditEntityPanel } from "@/components/contributions/EditEntityPanel";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getProgramBySlug, getRegionById } from "@/lib/data";
import { safeHostname } from "@/lib/geo";
import { useUtilities } from "@/lib/utilities-client";
import {
  AssetTypeLabel,
  CompensationTypeLabel,
  CompensationUnitLabel,
  GridServiceLabel,
  MarketSegmentLabel,
  ParticipationModelLabel,
  ProgramOrganizationRole,
  ProgramStatus,
} from "@/types/programs";
import { useExplorer } from "../ExplorerContext";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5m5-5-5 5 5 5" />
  </svg>
);

const ArrowIcon = () => (
  <svg className="cg-explore-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
);

export function ProgramDetailPanel({ slug }: { slug: string }) {
  const { goBack, navigateToDetail, setHighlight } = useExplorer();
  const { user } = useCurrentUser();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const program = getProgramBySlug(slug);
  const { utilities } = useUtilities();

  const primaryRegionId = program?.regions[0] ?? null;
  const region = primaryRegionId ? getRegionById(primaryRegionId) : null;

  const territoryFileKey = useMemo(() => {
    if (!region) return null;
    if (region.type === "CCA_TERRITORY" || region.type === "ISO" || region.type === "CUSTOM") {
      return region.slug;
    }
    return region.eiaId;
  }, [region]);

  useEffect(() => {
    if (!territoryFileKey) {
      setHighlight(null);
      return;
    }
    fetch(`/data/territories/${territoryFileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHighlight(data as FeatureCollection | null))
      .catch(() => setHighlight(null));
    return () => setHighlight(null);
  }, [territoryFileKey, setHighlight]);

  if (!program) {
    return (
      <div className="flex flex-col h-full">
        <div className="cg-explore-breadcrumb">
          <button type="button" className="cg-explore-breadcrumb-back" onClick={goBack}>
            <BackIcon /> Back
          </button>
        </div>
        <div className="cg-explore-empty">Program not found</div>
      </div>
    );
  }

  const adminOrgs = program.organizations.filter((o) => o.role === ProgramOrganizationRole.ADMINISTRATOR);
  const adminUtilities = adminOrgs.map((o) => utilities.find((u) => u.slug === o.entityId)).filter(Boolean);

  const statusLabel = (s: string) => {
    const labels: Record<string, string> = { ACTIVE: "Active", PAUSED: "Paused", FULL: "Full", DRAFT: "Draft", ARCHIVED: "Archived" };
    return labels[s] ?? s;
  };
  const statusColor = (s: string) =>
    s === ProgramStatus.ACTIVE ? "var(--cg-lime)" : s === ProgramStatus.PAUSED ? "var(--cg-amber)" : "var(--cg-muted)";

  return (
    <div className="flex flex-col h-full">
      <div className="cg-explore-breadcrumb">
        <button type="button" className="cg-explore-breadcrumb-back" onClick={goBack}>
          <BackIcon /> Programs
        </button>
        <span className="cg-explore-breadcrumb-sep">/</span>
        <span className="cg-explore-breadcrumb-current">{program.name}</span>
      </div>

      <div className="cg-explore-detail">
        <div className="cg-explore-detail-type">Program</div>
        <div className="cg-explore-detail-name">{program.name}</div>
        <div className="cg-explore-detail-sub">
          <span style={{ color: statusColor(program.status), fontWeight: 500 }}>{statusLabel(program.status)}</span>
          {program.description && ` · ${program.description.slice(0, 100)}${program.description.length > 100 ? "…" : ""}`}
        </div>

        {/* Overview KV table */}
        <div className="cg-explore-kv-table">
          {adminUtilities.length > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Administrator</span>
              <span className="cg-explore-kv-val">
                {adminUtilities.map((u) => u && (
                  <a
                    key={u.slug}
                    href="#"
                    onClick={(e) => { e.preventDefault(); navigateToDetail("utility", u.slug); }}
                  >
                    {u.name}
                  </a>
                ))}
              </span>
            </div>
          )}
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Asset Types</span>
            <span className="cg-explore-kv-val" style={{ fontFamily: "var(--cg-font-sans)", fontSize: 12 }}>
              {program.assetTypes.map((at) => AssetTypeLabel[at as keyof typeof AssetTypeLabel] ?? at).join(", ")}
            </span>
          </div>
          {program.marketSegments.length > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Market Segments</span>
              <span className="cg-explore-kv-val" style={{ fontFamily: "var(--cg-font-sans)", fontSize: 12 }}>
                {program.marketSegments.map((ms) => MarketSegmentLabel[ms as keyof typeof MarketSegmentLabel] ?? ms).join(", ")}
              </span>
            </div>
          )}
          {program.gridServices.length > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Grid Services</span>
              <span className="cg-explore-kv-val" style={{ fontFamily: "var(--cg-font-sans)", fontSize: 12 }}>
                {program.gridServices.map((gs) => GridServiceLabel[gs as keyof typeof GridServiceLabel] ?? gs).join(", ")}
              </span>
            </div>
          )}
          {program.participationModels.length > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Participation</span>
              <span className="cg-explore-kv-val" style={{ fontFamily: "var(--cg-font-sans)", fontSize: 12 }}>
                {program.participationModels.map((pm) => ParticipationModelLabel[pm as keyof typeof ParticipationModelLabel] ?? pm).join(", ")}
              </span>
            </div>
          )}
          {program.programWebsite && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Website</span>
              <span className="cg-explore-kv-val">
                <a href={program.programWebsite} target="_blank" rel="noopener noreferrer">
                  {safeHostname(program.programWebsite)}
                </a>
              </span>
            </div>
          )}
        </div>

        {/* Compensation */}
        {program.compensationTiers.length > 0 && (
          <>
            <div className="cg-explore-related-heading">Compensation</div>
            <div className="cg-explore-kv-table">
              {program.compensationTiers.map((tier) => (
                <div key={tier.tier} className="cg-explore-kv-row">
                  <span className="cg-explore-kv-key">
                    {CompensationTypeLabel[tier.type as keyof typeof CompensationTypeLabel] ?? tier.type}
                  </span>
                  <span className="cg-explore-kv-val">
                    ${tier.amount} {CompensationUnitLabel[tier.unit as keyof typeof CompensationUnitLabel] ?? tier.unit}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Related: administrator utilities */}
        {adminUtilities.length > 0 && (
          <>
            <div className="cg-explore-related-heading" style={{ marginTop: 16 }}>Related</div>
            {adminUtilities.map((u) => u && (
              <div
                key={u.slug}
                className="cg-explore-related-row"
                onClick={() => navigateToDetail("utility", u.slug)}
              >
                <span className="cg-explore-related-dot" style={{ background: "var(--cg-teal)" }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{u.name}</div>
                  <div className="cg-explore-related-type">Administrator</div>
                </div>
                <ArrowIcon />
              </div>
            ))}
          </>
        )}

        {/* Links */}
        {(program.faqUrl || program.termsUrl || program.contactUrl) && (
          <>
            <div className="cg-explore-related-heading" style={{ marginTop: 16 }}>Links</div>
            <div className="cg-explore-kv-table">
              {program.faqUrl && (
                <div className="cg-explore-kv-row">
                  <span className="cg-explore-kv-key">FAQ</span>
                  <span className="cg-explore-kv-val">
                    <a href={program.faqUrl} target="_blank" rel="noopener noreferrer">
                      {safeHostname(program.faqUrl)}
                    </a>
                  </span>
                </div>
              )}
              {program.termsUrl && (
                <div className="cg-explore-kv-row">
                  <span className="cg-explore-kv-key">Terms</span>
                  <span className="cg-explore-kv-val">
                    <a href={program.termsUrl} target="_blank" rel="noopener noreferrer">
                      {safeHostname(program.termsUrl)}
                    </a>
                  </span>
                </div>
              )}
              {program.contactUrl && (
                <div className="cg-explore-kv-row">
                  <span className="cg-explore-kv-key">Contact</span>
                  <span className="cg-explore-kv-val">
                    <a href={program.contactUrl} target="_blank" rel="noopener noreferrer">
                      {safeHostname(program.contactUrl)}
                    </a>
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Suggest Edit */}
        {user && (
          <div style={{ display: "flex", gap: 7, marginTop: 16 }}>
            <button
              type="button"
              className="cg-explore-fullpage-link"
              onClick={() => setIsEditOpen(true)}
            >
              Suggest Edit
            </button>
          </div>
        )}
      </div>

      {isEditOpen && program && (
        <EditEntityPanel
          entityType="program"
          entityId={program.slug}
          entitySlug={program.slug}
          entityName={program.name}
          currentValues={program as unknown as Record<string, unknown>}
          onClose={() => setIsEditOpen(false)}
          onSubmitted={() => setIsEditOpen(false)}
        />
      )}
    </div>
  );
}
