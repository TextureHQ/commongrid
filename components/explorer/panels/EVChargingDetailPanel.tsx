"use client";

import { useEffect } from "react";
import { useEvStation } from "@/hooks/useEvStation";
import { getEVStationHighlightGeoJSON } from "@/lib/explorer/ev-station-highlight";
import { getAccessLabel, getNetworkShortName, getStatusLabel } from "@/types/ev-charging";
import { useExplorer } from "../ExplorerContext";

export function EVChargingDetailPanel({ slug }: { slug: string }) {
  const { evStation: station, isLoading, error } = useEvStation(slug);
  const { setHighlight } = useExplorer();

  useEffect(() => {
    setHighlight(getEVStationHighlightGeoJSON(station));
    return () => setHighlight(null);
  }, [station, setHighlight]);

  if (!station) {
    return (
      <div className="cg-explore-empty" role="status">
        {isLoading ? "Loading station…" : error?.message || "EV station not found"}
      </div>
    );
  }

  const fields = [
    ["Address", `${station.streetAddress}, ${station.city}, ${station.state} ${station.zip}`],
    ["Network", getNetworkShortName(station.evNetwork)],
    ["Status", getStatusLabel(station.statusCode)],
    ["Access", getAccessLabel(station.accessCode)],
    ["DC Fast", station.evDcFastNum],
    ["Level 2", station.evLevel2EvseNum],
    ["Level 1", station.evLevel1EvseNum],
    ["Connectors", station.evConnectorTypes.join(", ") || "—"],
    ["Pricing", station.evPricing || "—"],
  ];

  return (
    <div className="cg-explore-detail">
      <div className="cg-explore-detail-type">EV Charging Station</div>
      <div className="cg-explore-detail-name">{station.stationName}</div>
      <div className="cg-explore-detail-sub">
        {station.city}, {station.state}
      </div>
      <div className="cg-explore-kv-table">
        {fields.map(([label, value]) => (
          <div className="cg-explore-kv-row" key={label}>
            <span className="cg-explore-kv-key">{label}</span>
            <span className="cg-explore-kv-val">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
