/**
 * Curated registry of U.S. investor-owned-utility (IOU) demand-response
 * programs (CG-289).
 *
 * WHY a curated registry (and not a scraped-blind crawler): there is no open,
 * federal catalog of *named* DR programs. EIA-861 is utility-level aggregate
 * statistics, not a program list, and DSIRE's structured API is access-gated +
 * licensed (can't be redistributed in an open dataset). So — exactly as the
 * distribution-co-op programs already in the Programs model were captured — the
 * IOU programs are curated from each utility's own public program pages into
 * structured facts here, then modeled by the pure mapper
 * (lib/sync/iou-dr-programs.ts) into the existing `programs` entity.
 *
 * Each entry carries:
 *   - `utility`: the strongest identifier that resolves against
 *     data/utilities.json — preferring `eiaId` (authoritative), else an exact
 *     utility `name`, optionally with `baCode` + `state`. The mapper's resolver
 *     (lib/sync/resolve-entity.ts) walks eia_id → ba_state → name_trgm.
 *   - the program name + public website URL, and
 *   - the structured enum facts curated from that public page.
 *
 * Fields that can't be verified from public sources are OMITTED — the mapper
 * prunes `undefined`, and applySync only asserts fields present here, so an
 * omitted field is never written (and never clobbers a human edit on a re-run).
 *
 * The scraper (scripts/sync-iou-dr-programs.ts) reads this registry, builds the
 * resolver input from data/utilities.json, optionally verifies each URL is
 * live, runs the mapper, and publishes via applySync. This file is pure data —
 * no I/O — so it (and its validation) are unit-testable offline.
 */

import {
  AssetType,
  DeviceType,
  GridService,
  IncentiveStructure,
  MarketSegment,
  ParticipationModel,
  ProgramStatus,
} from "@/types/programs";

/** How a registry entry names the administering utility, for the resolver. */
export interface RegistryUtilityRef {
  /** EIA utility number — authoritative when present. */
  eiaId?: string | number;
  /** Balancing-authority code, only useful paired with `state`. */
  baCode?: string;
  /** Two-letter state, only useful paired with `baCode`. */
  state?: string;
  /** Exact utility name as it appears in data/utilities.json (name fallback). */
  name?: string;
}

/**
 * One curated IOU demand-response program. Mirrors the `ScrapedProgram`
 * contract the mapper consumes, plus nothing else — the scraper passes these
 * straight through (optionally enriching `description` from the live page).
 */
export interface RegistryEntry {
  /** Program name as published by the utility. */
  name: string;
  /** Administering utility, by the strongest identifier that resolves. */
  utility: RegistryUtilityRef;
  /** Public program page. */
  programWebsite: string;
  description?: string;
  assetTypes?: AssetType[];
  deviceTypes?: DeviceType[];
  marketSegments?: MarketSegment[];
  participationModels?: ParticipationModel[];
  incentiveStructures?: IncentiveStructure[];
  gridServices?: GridService[];
  status?: ProgramStatus;
  faqUrl?: string;
  termsUrl?: string;
  contactUrl?: string;
  dermsVendor?: string;
}

// Shorthands keep the registry table readable without sacrificing the
// compile-time enum validity guarantee (tsc rejects a bad member here).
const A = AssetType;
const D = DeviceType;
const M = MarketSegment;
const P = ParticipationModel;
const I = IncentiveStructure;
const G = GridService;
const S = ProgramStatus;

export const IOU_DR_REGISTRY: RegistryEntry[] = [
  // ---- Marquee residential battery / BYOD -------------------------------
  {
    name: "Renewable Battery Connect",
    utility: { eiaId: 15466, name: "Public Service Company of Colorado" },
    programWebsite: "https://co.my.xcelenergy.com/s/business/renewable-battery-connect",
    assetTypes: [A.BATTERY],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.REBATE, I.CAPACITY_PAYMENT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING, G.CAPACITY],
    status: S.ACTIVE,
  },
  {
    name: "ConnectedSolutions",
    utility: { name: "National Grid" },
    programWebsite: "https://www.nationalgridus.com/MA-Home/Energy-Saving-Programs/ConnectedSolutions",
    assetTypes: [A.BATTERY, A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.PERFORMANCE_BASED],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "ConnectedSolutions",
    utility: { name: "Eversource Energy" },
    programWebsite:
      "https://www.eversource.com/content/residential/save-money-energy/manage-energy-costs-usage/connectedsolutions",
    assetTypes: [A.BATTERY, A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.PERFORMANCE_BASED],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Bring Your Own Device",
    utility: { eiaId: 7601, name: "Green Mountain Power" },
    programWebsite: "https://greenmountainpower.com/rebates-programs/home-energy-storage/bring-your-own-device/",
    assetTypes: [A.BATTERY],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT, I.CAPACITY_PAYMENT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Wattsmart Battery",
    utility: { eiaId: 14354, name: "Pacificorp" },
    programWebsite: "https://www.rockymountainpower.net/savings-energy-choices/wattsmart-battery-program.html",
    assetTypes: [A.BATTERY],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.REBATE, I.PERFORMANCE_BASED],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING, G.CAPACITY],
    status: S.ACTIVE,
  },
  {
    name: "Battery Bonus",
    utility: { eiaId: 19547, name: "Hawaiian Electric" },
    programWebsite:
      "https://www.hawaiianelectric.com/products-and-services/customer-renewable-programs/private-rooftop-solar/battery-bonus",
    assetTypes: [A.BATTERY, A.SOLAR_PV],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.SCHEDULED],
    incentiveStructures: [I.BILL_CREDIT, I.CAPACITY_PAYMENT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING, G.RENEWABLE_INTEGRATION],
    status: S.ACTIVE,
  },

  // ---- California IOUs ---------------------------------------------------
  {
    name: "SmartAC",
    utility: { eiaId: 14328, name: "Pacific Gas & Electric Company" },
    programWebsite:
      "https://www.pge.com/en_US/residential/save-energy-money/savings-solutions-and-rebates/smart-ac/smart-ac.page",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH, D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Emergency Load Reduction Program",
    utility: { eiaId: 14328, name: "Pacific Gas & Electric Company" },
    programWebsite:
      "https://www.pge.com/en_US/residential/save-energy-money/savings-solutions-and-rebates/demand-response-programs/emergency-load-reduction/emergency-load-reduction.page",
    assetTypes: [A.BATTERY, A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL, M.INDUSTRIAL],
    participationModels: [P.EVENT_BASED, P.AGGREGATOR_MANAGED],
    incentiveStructures: [I.PERFORMANCE_BASED, I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Summer Discount Plan",
    utility: { eiaId: 17609, name: "Southern California Edison" },
    programWebsite: "https://www.sce.com/residential/rebates-savings/summer-discount-plan",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT, I.RATE_DISCOUNT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Power Saver Rewards",
    utility: { eiaId: 16609, name: "San Diego Gas & Electric" },
    programWebsite: "https://www.sdge.com/residential/savings-center/rebates/power-saver-rewards",
    assetTypes: [A.WHOLE_HOME, A.THERMOSTAT],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- New York (ConEd + NYS IOUs) --------------------------------------
  {
    name: "Bring Your Own Thermostat",
    utility: { eiaId: 4226, name: "Consolidated Edison Co-NY" },
    programWebsite:
      "https://www.coned.com/en/save-money/rebates-incentives-tax-credits/rebates-for-home-appliances-electronics/smart-thermostats",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.REBATE, I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Smart Savings Rewards",
    utility: { eiaId: 4226, name: "Consolidated Edison Co-NY" },
    programWebsite: "https://www.coned.com/en/save-money/energy-saving-programs/smart-usage-rewards",
    assetTypes: [A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.PERFORMANCE_BASED],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Smart Savings Rewards",
    utility: { eiaId: 13511, name: "New York State Electric & Gas" },
    programWebsite: "https://www.nyseg.com/w/smart-savings-rewards",
    assetTypes: [A.THERMOSTAT, A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "ConnectedSolutions",
    utility: { eiaId: 13573, name: "Niagara Mohawk Power" },
    programWebsite: "https://www.nationalgridus.com/Upstate-NY-Home/Energy-Saving-Programs/ConnectedSolutions",
    assetTypes: [A.BATTERY],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.PERFORMANCE_BASED, I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Peak Perks",
    utility: { eiaId: 16183, name: "Rochester Gas & Electric" },
    programWebsite: "https://www.rge.com/w/smart-savings-rewards",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Peak Perks",
    utility: { eiaId: 3249, name: "Central Hudson Gas & Electric" },
    programWebsite: "https://www.cenhud.com/en/my-energy/energy-efficiency-and-savings/peak-perks/",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.REBATE],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Bring Your Own Thermostat",
    utility: { eiaId: 14154, name: "Orange & Rockland Utilities" },
    programWebsite: "https://www.oru.com/en/save-money/rebates-and-incentives/smart-thermostats",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.REBATE, I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- Southeast --------------------------------------------------------
  {
    name: "PowerManager",
    utility: { eiaId: 5416, name: "Duke Energy Carolinas" },
    programWebsite: "https://www.duke-energy.com/home/products/power-manager",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "EnergyWise Home",
    utility: { eiaId: 3046, name: "Duke Energy Progress" },
    programWebsite: "https://www.duke-energy.com/home/products/energywise-home",
    assetTypes: [A.HVAC, A.WATER_HEATER],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH, D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Smart Cooling Rewards",
    utility: { eiaId: 6452, name: "Florida Power & Light" },
    programWebsite: "https://www.fpl.com/save/programs/on-call.html",
    assetTypes: [A.HVAC, A.WATER_HEATER, A.POOL_PUMP],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Smart Usage",
    utility: { eiaId: 7140, name: "Georgia Power" },
    programWebsite:
      "https://www.georgiapower.com/residential/billing-and-rate-plans/pricing-and-rate-plans/smart-usage.html",
    assetTypes: [A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.SCHEDULED],
    incentiveStructures: [I.RATE_DISCOUNT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING, G.DEMAND_CHARGE_REDUCTION],
    status: S.ACTIVE,
  },
  {
    name: "Smart Cooling Rewards",
    utility: { name: "Dominion Energy" },
    programWebsite: "https://www.dominionenergy.com/virginia/save-energy/smart-cooling-rewards",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Smart Neighborhood",
    utility: { eiaId: 195, name: "Alabama Power" },
    programWebsite: "https://www.alabamapower.com/residential/products-programs/smart-neighborhood.html",
    assetTypes: [A.THERMOSTAT, A.WATER_HEATER, A.BATTERY],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Energy Select",
    utility: { eiaId: 18454, name: "Tampa Electric" },
    programWebsite: "https://www.tampaelectric.com/residential/saveenergyandmoney/energyselect/",
    assetTypes: [A.THERMOSTAT, A.HVAC, A.POOL_PUMP, A.WATER_HEATER],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.SCHEDULED],
    incentiveStructures: [I.RATE_DISCOUNT, I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Beat the Peak",
    utility: { eiaId: 12686, name: "Mississippi Power" },
    programWebsite: "https://www.mississippipower.com/residential/save-money-and-energy.html",
    assetTypes: [A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- Midwest / MISO ----------------------------------------------------
  {
    name: "Central AC Cycling",
    utility: { eiaId: 4110, name: "Commonwealth Edison" },
    programWebsite: "https://www.comed.com/ways-to-save/for-your-home/central-ac-cycling",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Peak Time Savings",
    utility: { eiaId: 4110, name: "Commonwealth Edison" },
    programWebsite: "https://www.comed.com/ways-to-save/for-your-home/peak-time-savings",
    assetTypes: [A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING, G.LOAD_SHIFTING],
    status: S.ACTIVE,
  },
  {
    name: "SmartCurrents Smart Thermostat",
    utility: { eiaId: 5109, name: "Dte Electric" },
    programWebsite:
      "https://www.dteenergy.com/us/en/residential/service-request/save-energy-money/smart-thermostats.html",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.REBATE],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "CoolCents",
    utility: { eiaId: 4254, name: "Consumers Energy" },
    programWebsite: "https://www.consumersenergy.com/residential/save-money-and-energy/rebates/smart-thermostat",
    assetTypes: [A.THERMOSTAT, A.HVAC],
    deviceTypes: [D.SMART_DEVICE, D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Peak Time Rewards",
    utility: { name: "Ameren" },
    programWebsite: "https://www.ameren.com/illinois/residential/electric-choice/peak-time-rewards",
    assetTypes: [A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Smart Thermostat Program",
    utility: { name: "Evergy" },
    programWebsite: "https://www.evergy.com/ways-to-save/save-money/thermostat-program",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.REBATE],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Saver's Switch",
    utility: { eiaId: 13781, name: "Northern States Power Company - Minnesota" },
    programWebsite: "https://mn.my.xcelenergy.com/s/residential/home-rebates/savers-switch",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Smart Thermostat Program",
    utility: { eiaId: 20847, name: "Wisconsin Electric Power" },
    programWebsite: "https://www.we-energies.com/residential/save-energy-money/smart-thermostat",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.REBATE],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Connected Savings",
    utility: { eiaId: 11479, name: "Madison Gas & Electric" },
    programWebsite: "https://www.mge.com/saving-energy/for-homes/thermostats",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Peak Rewards Thermostat",
    utility: { eiaId: 14232, name: "Otter Tail Power" },
    programWebsite: "https://www.otpco.com/save-energy-money/residential/",
    assetTypes: [A.THERMOSTAT, A.WATER_HEATER],
    deviceTypes: [D.SMART_DEVICE, D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- AEP operating companies (PJM/SPP) --------------------------------
  {
    name: "Bring Your Own Thermostat",
    utility: { eiaId: 14006, name: "Ohio Power" },
    programWebsite: "https://www.aepohio.com/save/business/programs/BYOT",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Bring Your Own Thermostat",
    utility: { eiaId: 733, name: "Appalachian Power" },
    programWebsite: "https://www.appalachianpower.com/save/programs/",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Bring Your Own Thermostat",
    utility: { eiaId: 9324, name: "Indiana Michigan Power" },
    programWebsite: "https://www.indianamichiganpower.com/save/",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Bring Your Own Thermostat",
    utility: { eiaId: 17698, name: "Southwestern Electric Power" },
    programWebsite: "https://www.swepco.com/save/",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- Exelon delivery companies (PJM) ----------------------------------
  {
    name: "Peak Rewards",
    utility: { eiaId: 1167, name: "Baltimore Gas & Electric" },
    programWebsite: "https://www.bge.com/WaysToSave/ForYourHome/Pages/PeakRewards.aspx",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH, D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Smart AC Saver",
    utility: { eiaId: 14940, name: "Peco Energy" },
    programWebsite: "https://www.peco.com/WaysToSave/ForYourHome/Pages/SmartACSaver.aspx",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Energy Wise Rewards",
    utility: { eiaId: 15270, name: "Potomac Electric Power" },
    programWebsite: "https://homeenergysavings.pepco.com/energy-wise-rewards",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Energy Wise Rewards",
    utility: { eiaId: 5027, name: "Delmarva Power" },
    programWebsite: "https://homeenergysavings.delmarva.com/energy-wise-rewards",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Energy Wise Rewards",
    utility: { eiaId: 963, name: "Atlantic City Electric" },
    programWebsite: "https://homeenergysavings.atlanticcityelectric.com/energy-wise-rewards",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- FirstEnergy (PJM) -------------------------------------------------
  {
    name: "Bring Your Own Thermostat",
    utility: { eiaId: 13998, name: "Ohio Edison" },
    programWebsite: "https://www.firstenergycorp.com/save_energy/save_energy_ohio.html",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Bring Your Own Thermostat",
    utility: { eiaId: 3755, name: "Cleveland Electric Illum" },
    programWebsite: "https://www.firstenergycorp.com/save_energy/save_energy_ohio.html",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Peak Time Savings",
    utility: { eiaId: 9726, name: "Jersey Central Power & Lt" },
    programWebsite: "https://www.firstenergycorp.com/save_energy/save_energy_new_jersey.html",
    assetTypes: [A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- New Jersey / Mid-Atlantic ----------------------------------------
  {
    name: "Smart Thermostat Program",
    utility: { eiaId: 15477, name: "Public Service Electric & Gas" },
    programWebsite: "https://homeenergy.pseg.com/smart-thermostat",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.REBATE],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Peak Rewards",
    utility: { eiaId: 5487, name: "Duquesne Light" },
    programWebsite: "https://duquesnelight.com/savings-energy-tools/savings-tips-programs",
    assetTypes: [A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- West / Southwest --------------------------------------------------
  {
    name: "Cool Rewards",
    utility: { eiaId: 803, name: "Arizona Public Service" },
    programWebsite: "https://www.aps.com/en/Residential/Save-Money-and-Energy/Rebates-and-Discounts/Cool-Rewards",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Smart Thermostat Program",
    utility: { eiaId: 24211, name: "Tucson Electric Power" },
    programWebsite: "https://www.tep.com/smart-thermostat/",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.REBATE],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Cool Keeper",
    utility: { eiaId: 14354, name: "Pacificorp" },
    programWebsite: "https://www.rockymountainpower.net/savings-energy-choices/home/cool-keeper.html",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "PowerShift Rewards",
    utility: { eiaId: 13407, name: "Nevada Power" },
    programWebsite: "https://www.nvenergy.com/save-with-powershift/demand-response",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Power Saver",
    utility: { eiaId: 15473, name: "Public Service Company of New Mexico" },
    programWebsite: "https://www.pnm.com/power-saver",
    assetTypes: [A.THERMOSTAT, A.HVAC],
    deviceTypes: [D.SMART_DEVICE, D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "AC Cool Credit",
    utility: { eiaId: 9191, name: "Idaho Power" },
    programWebsite:
      "https://www.idahopower.com/energy-environment/save-energy-and-money/save-with-programs/a-c-cool-credit/",
    assetTypes: [A.HVAC],
    deviceTypes: [D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Flex Peak Program",
    utility: { eiaId: 9191, name: "Idaho Power" },
    programWebsite:
      "https://www.idahopower.com/energy-environment/save-energy-and-money/save-with-programs/flex-peak-program/",
    assetTypes: [A.INDUSTRIAL_LOAD, A.COMMERCIAL_LOAD],
    marketSegments: [M.COMMERCIAL, M.INDUSTRIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.PERFORMANCE_BASED, I.DIRECT_PAYMENT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING, G.CAPACITY],
    status: S.ACTIVE,
  },
  {
    name: "Smart Thermostat Program",
    utility: { eiaId: 20169, name: "Avista" },
    programWebsite: "https://www.myavista.com/energy-savings/find-ways-to-save",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.REBATE],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Flex Rewards",
    utility: { eiaId: 15500, name: "Puget Sound Energy" },
    programWebsite: "https://www.pse.com/en/flex",
    assetTypes: [A.THERMOSTAT, A.WATER_HEATER, A.BATTERY],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Peak Time Rebate",
    utility: { eiaId: 15248, name: "Portland General Electric" },
    programWebsite: "https://portlandgeneral.com/save-money/save-money-home/peak-time-rebates",
    assetTypes: [A.WHOLE_HOME, A.THERMOSTAT],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING, G.LOAD_SHIFTING],
    status: S.ACTIVE,
  },
  {
    name: "SmartHours Thermostat",
    utility: { eiaId: 5701, name: "El Paso Electric" },
    programWebsite: "https://www.epelectric.com/save-money-energy",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Winter Peak Rebate",
    utility: { eiaId: 12199, name: "Montana-Dakota Utilities" },
    programWebsite: "https://www.montana-dakota.com/save-energy-money",
    assetTypes: [A.WHOLE_HOME],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- Texas (ERCOT delivery + SPP) -------------------------------------
  {
    name: "SmartAC",
    utility: { eiaId: 8901, name: "Centerpoint Energy" },
    programWebsite: "https://www.centerpointenergy.com/en-us/residential/save-energy-money",
    assetTypes: [A.HVAC, A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE, D.LOAD_MANAGEMENT_SWITCH],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Peak Rewards Thermostat",
    utility: { eiaId: 17718, name: "Southwestern Public Service" },
    programWebsite: "https://www.xcelenergy.com/programs_and_rebates",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },

  // ---- New England IOUs (ISO-NE) ----------------------------------------
  {
    name: "ConnectedSolutions",
    utility: { eiaId: 3266, name: "Central Maine Power Company" },
    programWebsite: "https://www.cmpco.com/save-energy",
    assetTypes: [A.BATTERY],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.PERFORMANCE_BASED, I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "Bring Your Own Thermostat",
    utility: { eiaId: 19497, name: "United Illuminating" },
    programWebsite: "https://www.uinet.com/wps/portal/uinet/smartenergy/",
    assetTypes: [A.THERMOSTAT],
    deviceTypes: [D.SMART_DEVICE],
    marketSegments: [M.RESIDENTIAL],
    participationModels: [P.DIRECT_CONTROL, P.EVENT_BASED],
    incentiveStructures: [I.BILL_CREDIT, I.REBATE],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
  {
    name: "ConnectedSolutions",
    utility: { eiaId: 13214, name: "The Narragansett Electric" },
    programWebsite: "https://www.rienergy.com/RI-Home/Energy-Saving-Programs/ConnectedSolutions",
    assetTypes: [A.BATTERY],
    marketSegments: [M.RESIDENTIAL, M.COMMERCIAL],
    participationModels: [P.DIRECT_CONTROL],
    incentiveStructures: [I.PERFORMANCE_BASED, I.BILL_CREDIT],
    gridServices: [G.DEMAND_RESPONSE, G.PEAK_SHAVING],
    status: S.ACTIVE,
  },
];
