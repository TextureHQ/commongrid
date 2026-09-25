"use client";

import { Skeleton } from "@texturehq/edges";
import { useEffect, useState } from "react";
import type { DetailView } from "@/lib/explorer/detail-view-tab";

export const DETAIL_SKELETON_DELAY_MS = 200;

// Match each panel's typical populated layout. Optional fields vary by record.
const layouts = {
  utility: { label: "utility", logo: false, rows: 5, related: ["Related", "Power Plants", "Programs", "Rates"] },
  iso: { label: "ISO", logo: true, rows: 3, related: ["RTOs", "Balancing Authorities", "Utilities"] },
  rto: { label: "RTO", logo: true, rows: 4, related: ["Utilities"] },
  ba: { label: "balancing authority", logo: false, rows: 5, related: ["Utilities", "Power Plants"] },
  program: { label: "program", logo: false, rows: 8, related: [] },
  "power-plant": { label: "power plant", logo: false, rows: 10, related: [] },
  rate: { label: "rate", logo: false, rows: 12, related: [] },
} satisfies Record<DetailView, { label: string; logo: boolean; rows: number; related: string[] }>;

function FieldRows({ count }: { count: number }) {
  return (
    <div className="cg-explore-kv-table">
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Static placeholders never reorder.
        <div className="cg-explore-kv-row" key={index}>
          <Skeleton width={index % 2 ? 90 : 65} height={19.5} />
          <Skeleton width={index % 2 ? "42%" : "32%"} height={18} />
        </div>
      ))}
    </div>
  );
}

/** Mount only while the primary request is pending, keyed by entity and slug.
 * Unmounting cancels the delay on success, error, navigation, or a cached hit.
 */
export function DetailPanelLoading({ entity }: { entity: DetailView }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), DETAIL_SKELETON_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const layout = layouts[entity];
  return (
    <section className="flex flex-col h-full" aria-busy="true" aria-label={`Loading ${layout.label}`}>
      {visible && (
        <div className="cg-explore-detail" role="status" aria-label={`Loading ${layout.label}`}>
          <div aria-hidden="true" data-detail-skeleton={entity}>
            {layout.logo && (
              <div className="cg-explore-detail-logo">
                <Skeleton width={40} height={40} variant="rect" />
              </div>
            )}
            <div className="cg-explore-detail-type">
              <Skeleton width={90} height={16.5} />
            </div>
            <div className="cg-explore-detail-name">
              <Skeleton width="85%" height={23} />
            </div>
            <div className="cg-explore-detail-sub">
              <Skeleton width="65%" height={19.5} />
              {entity === "program" && <Skeleton width="90%" height={19.5} />}
            </div>
            <FieldRows count={layout.rows} />
            {entity === "program" && (
              <>
                <div className="cg-explore-related-heading">
                  <Skeleton width={65} height={18} />
                </div>
                <FieldRows count={2} />
                <div className="cg-explore-related-heading">
                  <Skeleton width={45} height={18} />
                </div>
                <FieldRows count={3} />
              </>
            )}
            {layout.related.map((section) => (
              <div key={section}>
                <div className="cg-explore-related-heading">
                  <Skeleton width={section.length * 7} height={18} />
                </div>
                {[0, 1].map((row) => (
                  <div className="cg-explore-related-row" key={row}>
                    <Skeleton width={7} height={7} variant="circle" />
                    <div style={{ flex: 1 }}>
                      <div className="cg-explore-related-name">
                        <Skeleton width="75%" height={19.5} />
                      </div>
                      <div className="cg-explore-related-type">
                        <Skeleton width="45%" height={16.5} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
