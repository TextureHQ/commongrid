import { UtilitySegment, UtilitySegmentLabel, UtilityStatus, UtilityStatusLabel } from "@/types/entities";

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia", PR: "Puerto Rico", VI: "U.S. Virgin Islands",
  GU: "Guam", AS: "American Samoa", MP: "Northern Mariana Islands",
};

function getStateName(code: string): string | undefined {
  return STATE_NAMES[code.toUpperCase()];
}

export function getSegmentLabel(segment: string): string {
  return UtilitySegmentLabel[segment as UtilitySegment] ?? segment;
}

export function getSegmentBadgeVariant(segment: string): "info" | "success" | "warning" | "default" {
  const variants: Record<string, "info" | "success" | "warning" | "default"> = {
    [UtilitySegment.INVESTOR_OWNED_UTILITY]: "info",
    [UtilitySegment.DISTRIBUTION_COOPERATIVE]: "warning",
    [UtilitySegment.GENERATION_AND_TRANSMISSION]: "default",
    [UtilitySegment.MUNICIPAL_UTILITY]: "success",
    [UtilitySegment.COMMUNITY_CHOICE_AGGREGATOR]: "success",
    [UtilitySegment.POLITICAL_SUBDIVISION]: "success",
    [UtilitySegment.TRANSMISSION_OPERATOR]: "default",
    [UtilitySegment.JOINT_ACTION_AGENCY]: "default",
    [UtilitySegment.FEDERAL]: "info",
  };
  return variants[segment] ?? "default";
}

export function getStatusLabel(status: string): string {
  return UtilityStatusLabel[status as UtilityStatus] ?? status;
}

export function getStatusBadgeVariant(status: string): "success" | "warning" | "default" {
  const variants: Record<string, "success" | "warning" | "default"> = {
    [UtilityStatus.ACTIVE]: "success",
    [UtilityStatus.PENDING]: "warning",
    [UtilityStatus.MERGED]: "default",
    [UtilityStatus.ACQUIRED]: "default",
    [UtilityStatus.DEFUNCT]: "default",
  };
  return variants[status] ?? "default";
}

export function formatCustomerCount(count: number | null): string {
  if (count === null) return "\u2014";
  return count.toLocaleString();
}

export function formatStates(states: string[]): string {
  return states.map((s) => getStateName(s) ?? s).join(", ");
}
