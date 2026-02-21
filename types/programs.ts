// types/programs.ts

export enum ProgramOrganizationRole {
  ADMINISTRATOR = "ADMINISTRATOR",
  IMPLEMENTER = "IMPLEMENTER",
  FUNDER = "FUNDER",
  REGULATOR = "REGULATOR",
}

export enum AssetType {
  BATTERY = "BATTERY",
  THERMOSTAT = "THERMOSTAT",
  EV_CHARGER = "EV_CHARGER",
  WATER_HEATER = "WATER_HEATER",
  HVAC = "HVAC",
  SOLAR_PV = "SOLAR_PV",
  POOL_PUMP = "POOL_PUMP",
  GENERATOR = "GENERATOR",
  IRRIGATION = "IRRIGATION",
  INDUSTRIAL_LOAD = "INDUSTRIAL_LOAD",
  COMMERCIAL_LOAD = "COMMERCIAL_LOAD",
  WHOLE_HOME = "WHOLE_HOME",
  NON_DEVICE = "NON_DEVICE",
}

export const AssetTypeLabel: Record<AssetType, string> = {
  [AssetType.BATTERY]: "Battery Storage",
  [AssetType.THERMOSTAT]: "Smart Thermostat",
  [AssetType.EV_CHARGER]: "EV Charger",
  [AssetType.WATER_HEATER]: "Water Heater",
  [AssetType.HVAC]: "HVAC",
  [AssetType.SOLAR_PV]: "Solar PV",
  [AssetType.POOL_PUMP]: "Pool Pump",
  [AssetType.GENERATOR]: "Generator",
  [AssetType.IRRIGATION]: "Irrigation",
  [AssetType.INDUSTRIAL_LOAD]: "Industrial Load",
  [AssetType.COMMERCIAL_LOAD]: "Commercial Load",
  [AssetType.WHOLE_HOME]: "Whole Home",
  [AssetType.NON_DEVICE]: "Non-Device",
};

export enum MarketSegment {
  RESIDENTIAL = "RESIDENTIAL",
  COMMERCIAL = "COMMERCIAL",
  INDUSTRIAL = "INDUSTRIAL",
  AGRICULTURAL = "AGRICULTURAL",
  GOVERNMENT = "GOVERNMENT",
}

export const MarketSegmentLabel: Record<MarketSegment, string> = {
  [MarketSegment.RESIDENTIAL]: "Residential",
  [MarketSegment.COMMERCIAL]: "Commercial",
  [MarketSegment.INDUSTRIAL]: "Industrial",
  [MarketSegment.AGRICULTURAL]: "Agricultural",
  [MarketSegment.GOVERNMENT]: "Government",
};

export enum ParticipationModel {
  DIRECT_CONTROL = "DIRECT_CONTROL",
  SELF_DISPATCH = "SELF_DISPATCH",
  EVENT_BASED = "EVENT_BASED",
  SCHEDULED = "SCHEDULED",
  AGGREGATOR_MANAGED = "AGGREGATOR_MANAGED",
  AUTOMATED = "AUTOMATED",
  CONTINUOUS = "CONTINUOUS",
}

export const ParticipationModelLabel: Record<ParticipationModel, string> = {
  [ParticipationModel.DIRECT_CONTROL]: "Direct Control",
  [ParticipationModel.SELF_DISPATCH]: "Self Dispatch",
  [ParticipationModel.EVENT_BASED]: "Event-Based",
  [ParticipationModel.SCHEDULED]: "Scheduled",
  [ParticipationModel.AGGREGATOR_MANAGED]: "Aggregator Managed",
  [ParticipationModel.AUTOMATED]: "Automated",
  [ParticipationModel.CONTINUOUS]: "Continuous",
};

export enum IncentiveStructure {
  REBATE = "REBATE",
  BILL_CREDIT = "BILL_CREDIT",
  RATE_DISCOUNT = "RATE_DISCOUNT",
  DIRECT_PAYMENT = "DIRECT_PAYMENT",
  CAPACITY_PAYMENT = "CAPACITY_PAYMENT",
  PERFORMANCE_BASED = "PERFORMANCE_BASED",
  TAX_CREDIT = "TAX_CREDIT",
  LOAN = "LOAN",
  NONE = "NONE",
}

export enum GridService {
  DEMAND_RESPONSE = "DEMAND_RESPONSE",
  PEAK_SHAVING = "PEAK_SHAVING",
  LOAD_SHIFTING = "LOAD_SHIFTING",
  FREQUENCY_REGULATION = "FREQUENCY_REGULATION",
  DISTRIBUTION_VOLTAGE_SUPPORT = "DISTRIBUTION_VOLTAGE_SUPPORT",
  DISTRIBUTION_CAPACITY_SUPPORT = "DISTRIBUTION_CAPACITY_SUPPORT",
  CAPACITY = "CAPACITY",
  TRANSMISSION = "TRANSMISSION",
  ENERGY_ARBITRAGE = "ENERGY_ARBITRAGE",
  RENEWABLE_INTEGRATION = "RENEWABLE_INTEGRATION",
  LOAD_FLEXIBILITY = "LOAD_FLEXIBILITY",
  DEMAND_CHARGE_REDUCTION = "DEMAND_CHARGE_REDUCTION",
}

export const GridServiceLabel: Record<GridService, string> = {
  [GridService.DEMAND_RESPONSE]: "Demand Response",
  [GridService.PEAK_SHAVING]: "Peak Shaving",
  [GridService.LOAD_SHIFTING]: "Load Shifting",
  [GridService.FREQUENCY_REGULATION]: "Frequency Regulation",
  [GridService.DISTRIBUTION_VOLTAGE_SUPPORT]: "Distribution Voltage Support",
  [GridService.DISTRIBUTION_CAPACITY_SUPPORT]: "Distribution Capacity Support",
  [GridService.CAPACITY]: "Capacity",
  [GridService.TRANSMISSION]: "Transmission",
  [GridService.ENERGY_ARBITRAGE]: "Energy Arbitrage",
  [GridService.RENEWABLE_INTEGRATION]: "Renewable Integration",
  [GridService.LOAD_FLEXIBILITY]: "Load Flexibility",
  [GridService.DEMAND_CHARGE_REDUCTION]: "Demand Charge Reduction",
};

export enum ProgramStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  FULL = "FULL",
  ARCHIVED = "ARCHIVED",
}

export const ProgramStatusLabel: Record<ProgramStatus, string> = {
  [ProgramStatus.DRAFT]: "Draft",
  [ProgramStatus.ACTIVE]: "Active",
  [ProgramStatus.PAUSED]: "Paused",
  [ProgramStatus.FULL]: "Full",
  [ProgramStatus.ARCHIVED]: "Archived",
};

export enum CompensationType {
  REBATE = "REBATE",
  ANNUAL = "ANNUAL",
  MONTHLY = "MONTHLY",
  PER_EVENT = "PER_EVENT",
  BILL_CREDIT = "BILL_CREDIT",
  PERFORMANCE = "PERFORMANCE",
}

export const CompensationTypeLabel: Record<CompensationType, string> = {
  [CompensationType.REBATE]: "Rebate",
  [CompensationType.ANNUAL]: "Annual",
  [CompensationType.MONTHLY]: "Monthly",
  [CompensationType.PER_EVENT]: "Per Event",
  [CompensationType.BILL_CREDIT]: "Bill Credit",
  [CompensationType.PERFORMANCE]: "Performance",
};

export enum CompensationUnit {
  PER_DEVICE = "PER_DEVICE",
  PER_KW = "PER_KW",
  PER_KWH = "PER_KWH",
  PER_HOME = "PER_HOME",
  FLAT = "FLAT",
}

export const CompensationUnitLabel: Record<CompensationUnit, string> = {
  [CompensationUnit.PER_DEVICE]: "per device",
  [CompensationUnit.PER_KW]: "per kW",
  [CompensationUnit.PER_KWH]: "per kWh",
  [CompensationUnit.PER_HOME]: "per home",
  [CompensationUnit.FLAT]: "flat",
};

export interface ProgramOrganization {
  entityId: string;
  role: ProgramOrganizationRole;
}

export interface CompensationTier {
  tier: number;
  type: CompensationType;
  amount: number;
  unit: CompensationUnit;
  description?: string;
}

export interface ProgramSeason {
  startMonth: number;
  endMonth: number;
  description?: string;
}

export interface ProgramVariant {
  id: string;
  slug: string;
  name: string;
  description?: string;
  assetTypes?: AssetType[];
  marketSegments?: MarketSegment[];
  incentiveStructures?: IncentiveStructure[];
  compensationTiers?: CompensationTier[];
  maxEnrollments?: number;
}

export interface Program {
  id: string;
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
  organizations: ProgramOrganization[];
  assetTypes: AssetType[];
  marketSegments: MarketSegment[];
  participationModels: ParticipationModel[];
  incentiveStructures: IncentiveStructure[];
  gridServices: GridService[];
  regions: string[];
  compensationTiers: CompensationTier[];
  capacityTarget?: number;
  maxEnrollments?: number;
  programSeason?: ProgramSeason;
  launchedAt?: string;
  enrollmentOpens?: string;
  enrollmentCloses?: string;
  endsAt?: string;
  status: ProgramStatus;
  programWebsite?: string;
  faqUrl?: string;
  termsUrl?: string;
  contactUrl?: string;
  variants: ProgramVariant[];
  createdAt: string;
  updatedAt: string;
}
