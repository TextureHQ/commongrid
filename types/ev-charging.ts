/**
 * Type definitions for EV charging station data sourced from the
 * DOE Alternative Fuels Data Center (AFDC) / NREL API.
 */

export type EVNetwork =
  | "ChargePoint Network"
  | "Tesla"
  | "Electrify America"
  | "EVgo Network"
  | "Blink Network"
  | "SHELL_RECHARGE"
  | "OpConnect"
  | "SemaConnect"
  | "Greenlots"
  | "EV Connect"
  | "Volta"
  | "AmpUp"
  | "EVCS"
  | "Non-Networked"
  | string;

export type EVAccessCode = "public" | "private" | "restricted";

export type EVStatusCode = "E" | "P" | "T";

export type EVOwnerTypeCode = "P" | "FG" | "SG" | "LG" | "T";

export type EVConnectorType =
  | "J1772"
  | "J1772COMBO"
  | "CHADEMO"
  | "TESLA"
  | "NACS"
  | string;

export interface EVStation {
  id: string;
  slug: string;
  stationName: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  evNetwork: string | null;
  evLevel1EvseNum: number;
  evLevel2EvseNum: number;
  evDcFastNum: number;
  evConnectorTypes: string[];
  accessCode: EVAccessCode;
  statusCode: EVStatusCode;
  openDate: string | null;
  facilityType: string | null;
  ownerTypeCode: EVOwnerTypeCode | null;
  evPricing: string | null;
}

export type EVChargingLevel = "all" | "level2" | "dcfast";

export const EV_NETWORKS: Array<{ id: string; label: string }> = [
  { id: "ChargePoint Network", label: "ChargePoint" },
  { id: "Tesla", label: "Tesla" },
  { id: "Electrify America", label: "Electrify America" },
  { id: "EVgo Network", label: "EVgo" },
  { id: "Blink Network", label: "Blink" },
  { id: "Non-Networked", label: "Non-Networked" },
];

export const EV_NETWORK_COLORS: Record<string, string> = {
  "ChargePoint Network": "#0070f3",
  "Tesla": "#cc0000",
  "Electrify America": "#00a550",
  "EVgo Network": "#f97316",
  "Blink Network": "#8b5cf6",
};

export function getNetworkColor(network: string | null): string {
  if (!network) return "#9ca3af";
  return EV_NETWORK_COLORS[network] ?? "#9ca3af";
}

export function getNetworkShortName(network: string | null): string {
  if (!network) return "Non-Networked";
  const map: Record<string, string> = {
    "ChargePoint Network": "ChargePoint",
    "Tesla": "Tesla",
    "Electrify America": "Electrify America",
    "EVgo Network": "EVgo",
    "Blink Network": "Blink",
    "Non-Networked": "Non-Networked",
  };
  return map[network] ?? network;
}

export function getStatusLabel(status: EVStatusCode): string {
  const map: Record<EVStatusCode, string> = {
    E: "Open",
    P: "Planned",
    T: "Temporarily Unavailable",
  };
  return map[status] ?? status;
}

export function getAccessLabel(access: EVAccessCode): string {
  const map: Record<EVAccessCode, string> = {
    public: "Public",
    private: "Private",
    restricted: "Restricted",
  };
  return map[access] ?? access;
}

export function getTotalConnectors(station: EVStation): number {
  return station.evLevel1EvseNum + station.evLevel2EvseNum + station.evDcFastNum;
}
