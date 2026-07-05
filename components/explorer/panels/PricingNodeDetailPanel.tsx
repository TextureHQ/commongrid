"use client";

import { useState } from "react";
import { EditEntityPanel } from "@/components/contributions/EditEntityPanel";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePricingNode } from "@/hooks/usePricingNode";
import { getIsoColor, getNodeTypeLabel, ISO_FULL_NAMES, ISO_LABELS } from "@/types/pricing-nodes";

export function PricingNodeDetailPanel({ slug }: { slug: string }) {
  const { user } = useCurrentUser();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { pricingNode } = usePricingNode(slug);

  if (!pricingNode) {
    return (
      <div className="flex flex-col h-full">
        <div className="cg-explore-empty">Pricing node not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="cg-explore-detail">
        <div className="cg-explore-detail-type">Pricing Node</div>
        <div className="cg-explore-detail-name">{pricingNode.name}</div>
        <div className="cg-explore-detail-sub">
          {ISO_LABELS[pricingNode.iso]} · {getNodeTypeLabel(pricingNode.nodeType)}
          {pricingNode.zone && ` · ${pricingNode.zone}`}
        </div>

        <div className="cg-explore-kv-table">
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">ISO/RTO</span>
            <span className="cg-explore-kv-val">
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5"
                style={{ background: getIsoColor(pricingNode.iso) }}
              />
              {ISO_FULL_NAMES[pricingNode.iso] ?? ISO_LABELS[pricingNode.iso]}
            </span>
          </div>
          <div className="cg-explore-kv-row">
            <span className="cg-explore-kv-key">Node Type</span>
            <span className="cg-explore-kv-val">{getNodeTypeLabel(pricingNode.nodeType)}</span>
          </div>
          {pricingNode.zone && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Zone</span>
              <span className="cg-explore-kv-val">{pricingNode.zone}</span>
            </div>
          )}
          {pricingNode.state && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">State</span>
              <span className="cg-explore-kv-val">{pricingNode.state}</span>
            </div>
          )}
          {pricingNode.voltageKv && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Voltage</span>
              <span className="cg-explore-kv-val">{pricingNode.voltageKv} kV</span>
            </div>
          )}
          {pricingNode.eiaPlantCode && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">EIA Plant Code</span>
              <span className="cg-explore-kv-val">{pricingNode.eiaPlantCode}</span>
            </div>
          )}
          {pricingNode.source && (
            <div className="cg-explore-kv-row">
              <span className="cg-explore-kv-key">Source</span>
              <span className="cg-explore-kv-val">{pricingNode.source}</span>
            </div>
          )}
        </div>

        {user && (
          <div style={{ display: "flex", gap: 7, marginTop: 16 }}>
            <button type="button" className="cg-explore-fullpage-link" onClick={() => setIsEditOpen(true)}>
              Suggest Edit
            </button>
          </div>
        )}
      </div>

      {isEditOpen && pricingNode && (
        <EditEntityPanel
          entityType="pricing-node"
          entityId={pricingNode.slug}
          entitySlug={pricingNode.slug}
          entityName={pricingNode.name}
          currentValues={pricingNode as unknown as Record<string, unknown>}
          onClose={() => setIsEditOpen(false)}
          onSubmitted={() => setIsEditOpen(false)}
        />
      )}
    </div>
  );
}
