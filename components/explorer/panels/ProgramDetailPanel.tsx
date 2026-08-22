"use client";

import type { Feature, FeatureCollection } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { DeleteEntityDialog } from "@/components/contributions/DeleteEntityDialog";
import { EditEntityPanel } from "@/components/contributions/EditEntityPanel";
import { EntityVersionHistory } from "@/components/contributions/EntityVersionHistory";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useProgram } from "@/hooks/useProgram";
import { useUtilityNames } from "@/hooks/useUtilityNames";
import { entityKindColor } from "@/lib/categorical-colors";
import { getRegionById } from "@/lib/data";
import { safeHostname } from "@/lib/geo";
import {
  administratorOrganizations,
  nonAdministratorOrganizations,
  programOrganizationSlugs,
  resolveProgramOrganizations,
} from "@/lib/programs/resolve-organizations";
import {
  AssetTypeLabel,
  CompensationTypeLabel,
  CompensationUnitLabel,
  GridServiceLabel,
  MarketSegmentLabel,
  ParticipationModelLabel,
  ProgramStatus,
} from "@/types/programs";
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

const linkButtonStyle = {
  background: "none",
  border: 0,
  padding: 0,
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  textAlign: "left" as const,
};

export function ProgramDetailPanel({ slug }: { slug: string }) {
  const { navigateToDetail, setHighlight } = useExplorer();
  const { user } = useCurrentUser();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { program } = useProgram(slug);

  // Resolve the program's organization slugs directly instead of scanning the
  // first N utilities alphabetically. The old `useUtilityList({ limit: 200 })`
  // lookup silently rendered no administrator at all for any utility past the
  // alphabetical cap (3,133 utilities, 200 fetched) — e.g. "AC Load Management"
  // administered by central-georgia-el-member showed a website but no utility.
  const organizationSlugs = useMemo(() => programOrganizationSlugs(program), [program]);

  const { utilitiesBySlug } = useUtilityNames(organizationSlugs);

  // Resolve territory file keys for all program regions
  const territoryFileKeys = useMemo(() => {
    if (!program) return [];
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const regionId of program.regions) {
      const region = getRegionById(regionId);
      if (!region) continue;
      const key =
        region.type === "CCA_TERRITORY" || region.type === "ISO" || region.type === "CUSTOM"
          ? region.slug
          : region.eiaId;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    return keys;
  }, [program]);

  useEffect(() => {
    if (territoryFileKeys.length === 0) {
      setHighlight(null);
      return;
    }

    let cancelled = false;

    async function loadAll() {
      const results = await Promise.allSettled(
        territoryFileKeys.map(async (key) => {
          const res = await fetch(`/data/territories/${key}.json`);
          if (!res.ok) return null;
          return (await res.json()) as FeatureCollection;
        })
      );

      if (cancelled) return;

      const allFeatures: Feature[] = [];
      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;
        allFeatures.push(...result.value.features);
      }

      if (allFeatures.length > 0) {
        setHighlight({ type: "FeatureCollection", features: allFeatures });
      } else {
        setHighlight(null);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
      setHighlight(null);
    };
  }, [territoryFileKeys, setHighlight]);

  if (!program) {
    return (
      <div className="flex flex-col h-full">
        <div className="cg-explore-empty">Program not found</div>
      </div>
    );
  }

  // Every organization on the program, resolved to a utility where possible.
  // Unresolved slugs still render (humanized) so the panel never hides the
  // utility a program belongs to.
  const organizations = resolveProgramOrganizations(program, utilitiesBySlug);
  const adminOrganizations = administratorOrganizations(organizations);
  const otherOrganizations = nonAdministratorOrganizations(organizations);

  const statusLabel = (s: string) => {
    const labels: Record<string, string> = {
      ACTIVE: "Active",
      PAUSED: "Paused",
      FULL: "Full",
      DRAFT: "Draft",
      ARCHIVED: "Archived",
    };
    return labels[s] ?? s;
  };
  const statusColor = (s: string) =>
    s === ProgramStatus.ACTIVE
      ? "var(--color-feedback-success-text)"
      : s === ProgramStatus.PAUSED
        ? "var(--color-feedback-warning-text)"
        : "var(--color-text-muted)";

  return (
    <div className="flex flex-col h-full">
      <div className="cg-explore-detail">
        <div className="cg-explore-detail-type">Program</div>
        <div className="cg-explore-detail-name">{program.name}</div>
        <div className="cg-explore-detail-sub">
          <span style={{ color: statusColor(program.status), fontWeight: 500 }}>{statusLabel(program.status)}</span>
          {program.description &&
            ` · ${program.description.slice(0, 100)}${program.description.length > 100 ? "…" : ""}`}
        </div>

        <div className="mt-3">
          <EntityVersionHistory entityType="program" entitySlug={slug} />
        </div>

        {/* Overview KV table */}
        <div className="cg-explore-kv-table">
          {adminOrganizations.length > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Utility</span>
              <span className="cg-explore-kv-val">
                {adminOrganizations.map((o, i) => (
                  <span key={o.entityId}>
                    {i > 0 && ", "}
                    {o.resolved ? (
                      <button
                        type="button"
                        onClick={() => navigateToDetail("utility", o.entityId)}
                        style={linkButtonStyle}
                      >
                        {o.name}
                      </button>
                    ) : (
                      o.name
                    )}
                  </span>
                ))}
              </span>
            </div>
          )}
          {otherOrganizations.map((o) => (
            <div key={`${o.role}-${o.entityId}`} className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">{o.roleLabel}</span>
              <span className="cg-explore-kv-val">
                {o.resolved ? (
                  <button type="button" onClick={() => navigateToDetail("utility", o.entityId)} style={linkButtonStyle}>
                    {o.name}
                  </button>
                ) : (
                  o.name
                )}
              </span>
            </div>
          ))}
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Asset Types</span>
            <span className="cg-explore-kv-val" style={{ fontFamily: "var(--font-family-sans)", fontSize: 12 }}>
              {program.assetTypes.map((at) => AssetTypeLabel[at as keyof typeof AssetTypeLabel] ?? at).join(", ")}
            </span>
          </div>
          {program.marketSegments.length > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Market Segments</span>
              <span className="cg-explore-kv-val" style={{ fontFamily: "var(--font-family-sans)", fontSize: 12 }}>
                {program.marketSegments
                  .map((ms) => MarketSegmentLabel[ms as keyof typeof MarketSegmentLabel] ?? ms)
                  .join(", ")}
              </span>
            </div>
          )}
          {program.gridServices.length > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Grid Services</span>
              <span className="cg-explore-kv-val" style={{ fontFamily: "var(--font-family-sans)", fontSize: 12 }}>
                {program.gridServices
                  .map((gs) => GridServiceLabel[gs as keyof typeof GridServiceLabel] ?? gs)
                  .join(", ")}
              </span>
            </div>
          )}
          {program.participationModels.length > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Participation</span>
              <span className="cg-explore-kv-val" style={{ fontFamily: "var(--font-family-sans)", fontSize: 12 }}>
                {program.participationModels
                  .map((pm) => ParticipationModelLabel[pm as keyof typeof ParticipationModelLabel] ?? pm)
                  .join(", ")}
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

        {/* Related: organizations behind the program */}
        {organizations.length > 0 && (
          <>
            <div className="cg-explore-related-heading" style={{ marginTop: 16 }}>
              Related
            </div>
            {organizations.map((o) => (
              <button
                key={`${o.role}-${o.entityId}`}
                className="cg-explore-related-row"
                type="button"
                onClick={o.resolved ? () => navigateToDetail("utility", o.entityId) : undefined}
                disabled={!o.resolved}
                style={o.resolved ? undefined : { cursor: "default" }}
              >
                <span className="cg-explore-related-dot" style={{ background: entityKindColor("utilities") }} />
                <div style={{ flex: 1 }}>
                  <div className="cg-explore-related-name">{o.name}</div>
                  <div className="cg-explore-related-type">{o.roleLabel}</div>
                </div>
                {o.resolved && <ArrowIcon />}
              </button>
            ))}
          </>
        )}

        {/* Links */}
        {(program.faqUrl || program.termsUrl || program.contactUrl) && (
          <>
            <div className="cg-explore-related-heading" style={{ marginTop: 16 }}>
              Links
            </div>
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
            <button type="button" className="cg-explore-fullpage-link" onClick={() => setIsEditOpen(true)}>
              Suggest Edit
            </button>
            <button type="button" className="cg-explore-fullpage-link" onClick={() => setIsDeleteOpen(true)}>
              Request Deletion
            </button>
          </div>
        )}
      </div>

      {isEditOpen && program && (
        <EditEntityPanel
          entityType="program"
          entityId={program.id}
          entitySlug={program.slug}
          entityName={program.name}
          currentValues={program as unknown as Record<string, unknown>}
          onClose={() => setIsEditOpen(false)}
          onSubmitted={() => setIsEditOpen(false)}
        />
      )}

      {isDeleteOpen && program && (
        <DeleteEntityDialog
          entityType="program"
          entityId={program.id}
          entityName={program.name}
          entityVersion={program.version ?? 1}
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          onSuccess={() => setIsDeleteOpen(false)}
        />
      )}
    </div>
  );
}
