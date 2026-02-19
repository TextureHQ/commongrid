export enum UtilitySegment {
  DISTRIBUTION_COOPERATIVE = "DISTRIBUTION_COOPERATIVE",
  GENERATION_AND_TRANSMISSION = "GENERATION_AND_TRANSMISSION",
  INVESTOR_OWNED_UTILITY = "INVESTOR_OWNED_UTILITY",
  MUNICIPAL_UTILITY = "MUNICIPAL_UTILITY",
  COMMUNITY_CHOICE_AGGREGATOR = "COMMUNITY_CHOICE_AGGREGATOR",
  POLITICAL_SUBDIVISION = "POLITICAL_SUBDIVISION",
  TRANSMISSION_OPERATOR = "TRANSMISSION_OPERATOR",
  JOINT_ACTION_AGENCY = "JOINT_ACTION_AGENCY",
  FEDERAL = "FEDERAL",
}

export const UtilitySegmentLabel: Record<UtilitySegment, string> = {
  [UtilitySegment.DISTRIBUTION_COOPERATIVE]: "Distribution Co-op",
  [UtilitySegment.GENERATION_AND_TRANSMISSION]: "G&T Co-op",
  [UtilitySegment.INVESTOR_OWNED_UTILITY]: "Investor-Owned",
  [UtilitySegment.MUNICIPAL_UTILITY]: "Municipal",
  [UtilitySegment.COMMUNITY_CHOICE_AGGREGATOR]: "CCA",
  [UtilitySegment.POLITICAL_SUBDIVISION]: "Political Subdivision",
  [UtilitySegment.TRANSMISSION_OPERATOR]: "Transmission Operator",
  [UtilitySegment.JOINT_ACTION_AGENCY]: "Joint Action Agency",
  [UtilitySegment.FEDERAL]: "Federal",
};

export enum UtilityStatus {
  ACTIVE = "ACTIVE",
  MERGED = "MERGED",
  ACQUIRED = "ACQUIRED",
  DEFUNCT = "DEFUNCT",
  PENDING = "PENDING",
}

export const UtilityStatusLabel: Record<UtilityStatus, string> = {
  [UtilityStatus.ACTIVE]: "Active",
  [UtilityStatus.MERGED]: "Merged",
  [UtilityStatus.ACQUIRED]: "Acquired",
  [UtilityStatus.DEFUNCT]: "Defunct",
  [UtilityStatus.PENDING]: "Pending",
};

export interface Utility {
  id: string;
  slug: string;
  name: string;
  eiaName: string | null;
  shortName: string | null;
  logo: string | null;
  website: string | null;
  eiaId: string | null;
  segment: UtilitySegment;
  status: UtilityStatus;
  customerCount: number | null;
  peakDemandMw: number | null;
  winterPeakDemandMw: number | null;
  totalRevenueDollars: number | null;
  totalSalesMwh: number | null;
  baCode: string | null;
  nercRegion: string | null;
  hasGeneration: boolean | null;
  hasTransmission: boolean | null;
  hasDistribution: boolean | null;
  amiMeterCount: number | null;
  totalMeterCount: number | null;
  jurisdiction: string | null;
  isoId: string | null;
  rtoId: string | null;
  balancingAuthorityId: string | null;
  generationProviderId: string | null;
  transmissionProviderId: string | null;
  parentId: string | null;
  successorId: string | null;
  serviceTerritoryId: string | null;
  notionPageId: string | null;
}

export enum RegionType {
  SERVICE_TERRITORY = "SERVICE_TERRITORY",
  STATE = "STATE",
  COUNTY = "COUNTY",
  ISO = "ISO",
  BALANCING_AUTHORITY = "BALANCING_AUTHORITY",
  RTO = "RTO",
  CCA_TERRITORY = "CCA_TERRITORY",
  CUSTOM = "CUSTOM",
}

export const RegionTypeLabel: Record<RegionType, string> = {
  [RegionType.SERVICE_TERRITORY]: "Service Territory",
  [RegionType.STATE]: "State",
  [RegionType.COUNTY]: "County",
  [RegionType.ISO]: "ISO",
  [RegionType.BALANCING_AUTHORITY]: "Balancing Authority",
  [RegionType.RTO]: "RTO",
  [RegionType.CCA_TERRITORY]: "CCA Territory",
  [RegionType.CUSTOM]: "Custom",
};

export interface Region {
  id: string;
  slug: string;
  name: string;
  type: RegionType;
  eiaId: string | null;
  state: string | null;
  customers: number | null;
  source: string | null;
  sourceDate: string | null;
}

export interface Iso {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  logo: string | null;
  website: string | null;
  states: string[];
  regionId: string | null;
}

export interface Rto {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  logo: string | null;
  website: string | null;
  states: string[];
  regionId: string | null;
}

export interface BalancingAuthority {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  logo: string | null;
  eiaCode: string | null;
  eiaId: string | null;
  website: string | null;
  states: string[];
  isoId: string | null;
  regionId: string | null;
}
