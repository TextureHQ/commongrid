"use client";

import { useState } from "react";
import { DeleteEntityDialog } from "@/components/contributions/DeleteEntityDialog";
import { EditEntityPanel } from "@/components/contributions/EditEntityPanel";
import { EntityVersionHistory } from "@/components/contributions/EntityVersionHistory";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePowerPlant } from "@/hooks/usePowerPlant";
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

export function PowerPlantDetailPanel({ slug }: { slug: string }) {
  const { user } = useCurrentUser();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { navigateToDetail } = useExplorer();
  const { powerPlant } = usePowerPlant(slug);

  if (!powerPlant) {
    return (
      <div className="flex flex-col h-full">
        <div className="cg-explore-empty">Power plant not found</div>
      </div>
    );
  }

  const capacityDisplay =
    powerPlant.totalCapacityMw >= 1000
      ? `${(powerPlant.totalCapacityMw / 1000).toFixed(1)} GW`
      : `${powerPlant.totalCapacityMw.toLocaleString()} MW`;

  const statusLabel = powerPlant.status === "operable" ? "Operable" : "Proposed";
  const utilityId = powerPlant.utilityId;
  const utilityName = powerPlant.utilityName;
  const balancingAuthorityId = powerPlant.balancingAuthorityId;
  const balancingAuthorityLabel = powerPlant.baCode ?? balancingAuthorityId;

  return (
    <div className="flex flex-col h-full">
      <div className="cg-explore-detail">
        <div className="cg-explore-detail-type">Power Plant</div>
        <div className="cg-explore-detail-name">{powerPlant.name}</div>
        <div className="cg-explore-detail-sub">
          <span>{statusLabel}</span>
          {powerPlant.primaryFuel && ` · ${powerPlant.primaryFuel}`}
          {` · ${capacityDisplay}`}
        </div>

        <div className="mt-3">
          <EntityVersionHistory entityType="power_plant" entitySlug={slug} />
        </div>

        <div className="cg-explore-kv-table">
          {utilityId && utilityName && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Utility</span>
              <span className="cg-explore-kv-val">
                <button type="button" onClick={() => navigateToDetail("utility", utilityId)} style={linkButtonStyle}>
                  {utilityName}
                </button>
              </span>
            </div>
          )}
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Fuel Category</span>
            <span className="cg-explore-kv-val">{powerPlant.fuelCategory}</span>
          </div>
          {powerPlant.primaryFuel && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Primary Fuel</span>
              <span className="cg-explore-kv-val">{powerPlant.primaryFuel}</span>
            </div>
          )}
          {powerPlant.technologies.length > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Technologies</span>
              <span className="cg-explore-kv-val" style={{ fontFamily: "var(--font-family-sans)", fontSize: 12 }}>
                {powerPlant.technologies.join(", ")}
              </span>
            </div>
          )}
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Total Capacity</span>
            <span className="cg-explore-kv-val">{capacityDisplay}</span>
          </div>
          {powerPlant.generatorCount > 0 && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Generators</span>
              <span className="cg-explore-kv-val">{powerPlant.generatorCount}</span>
            </div>
          )}
          {powerPlant.operatingYear && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Operating Year</span>
              <span className="cg-explore-kv-val">{powerPlant.operatingYear}</span>
            </div>
          )}
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">NERC Region</span>
            <span className="cg-explore-kv-val">{powerPlant.nercRegion ?? "—"}</span>
          </div>
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">State</span>
            <span className="cg-explore-kv-val">
              {powerPlant.county ? `${powerPlant.county}, ${powerPlant.state}` : powerPlant.state}
            </span>
          </div>
          {balancingAuthorityId && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Balancing Authority</span>
              <span className="cg-explore-kv-val">
                <button
                  type="button"
                  onClick={() => navigateToDetail("ba", balancingAuthorityId)}
                  style={linkButtonStyle}
                >
                  {balancingAuthorityLabel}
                </button>
              </span>
            </div>
          )}
          {powerPlant.plantCode && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Plant Code</span>
              <span className="cg-explore-kv-val">{powerPlant.plantCode}</span>
            </div>
          )}
        </div>

        {user && (
          <div style={{ display: "flex", gap: 7, marginTop: 16 }}>
            <button type="button" className="cg-explore-fullpage-link" onClick={() => setIsEditOpen(true)}>
              Suggest Edit
            </button>
            <button
              type="button"
              className="cg-explore-fullpage-link"
              onClick={() => setIsDeleteOpen(true)}
              style={{ color: "var(--color-feedback-error)" }}
            >
              Request Deletion
            </button>
          </div>
        )}
      </div>

      {isEditOpen && powerPlant && (
        <EditEntityPanel
          entityType="power_plant"
          entityId={powerPlant.id}
          entitySlug={powerPlant.slug}
          entityName={powerPlant.name}
          currentValues={powerPlant as unknown as Record<string, unknown>}
          onClose={() => setIsEditOpen(false)}
          onSubmitted={() => setIsEditOpen(false)}
        />
      )}

      {isDeleteOpen && powerPlant && (
        <DeleteEntityDialog
          entityType="power_plant"
          entityId={powerPlant.id}
          entityName={powerPlant.name}
          entityVersion={powerPlant.version ?? 1}
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          onSuccess={() => setIsDeleteOpen(false)}
        />
      )}
    </div>
  );
}
