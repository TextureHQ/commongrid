# OpenGrid Data Catalog

> **Last updated:** 2026-02-18
>
> A comprehensive inventory of open/public data sources for US (and international) electric grid intelligence. Covers what OpenGrid currently has, what we plan to add, and where the gaps are.

---

## Table of Contents

- [Currently Available Datasets](#currently-available-datasets)
- [Planned / In Progress](#planned--in-progress)
  - [Generation & Power Plants](#1-generation--power-plants)
  - [Transmission & Substations](#2-transmission--substations)
  - [Grid Operations & Market Data](#3-grid-operations--market-data)
  - [Emissions & Environmental](#4-emissions--environmental)
  - [Rates, Tariffs & Retail Data](#5-rates-tariffs--retail-data)
  - [Renewable Energy & DER](#6-renewable-energy--distributed-energy-resources)
  - [EV Charging Infrastructure](#7-ev-charging-infrastructure)
  - [Energy Storage](#8-energy-storage)
  - [Interconnection Queues](#9-interconnection-queues)
  - [Reliability & Outages](#10-reliability--outages)
  - [Demand Response & Energy Efficiency](#11-demand-response--energy-efficiency)
  - [Regulatory & FERC Data](#12-regulatory--ferc-data)
  - [International Grid Data](#13-international-grid-data)
  - [Meta-Sources & Aggregators](#14-meta-sources--aggregators)
- [Gap Analysis](#gap-analysis)

---

## Currently Available Datasets

### 1. Utilities

| Field | Value |
|-------|-------|
| **Description** | Comprehensive registry of US electric utilities — investor-owned utilities (IOUs), cooperatives, municipal utilities, power marketers, and CCAs. Includes organizational metadata, EIA identifiers, customer counts, peak demand, revenue, sales, BA codes, NERC regions, meter counts, and jurisdictional information. |
| **Record Count** | 3,132 entities |
| **Schema** | `id`, `slug`, `name`, `eiaId`, `segment` (IOU/COOP/MUNI/etc.), `status`, `customerCount`, `peakDemandMw`, `winterPeakDemandMw`, `totalRevenueDollars`, `totalSalesMwh`, `baCode`, `nercRegion`, `hasGeneration`, `hasTransmission`, `hasDistribution`, `amiMeterCount`, `totalMeterCount`, `jurisdiction`, `isoId`, `rtoId`, `balancingAuthorityId`, `serviceTerritoryId`, and more |
| **Source** | EIA Form 861 (2024 XLSX) + Notion Knowledge Base |
| **Format** | JSON (`data/utilities.json`) |
| **Coverage** | All 50 US states + DC + territories |
| **Update Frequency** | Annual (EIA-861 released ~October each year) |
| **License** | Public domain (US government data) |
| **How We Get It** | `sync:notion` → `enrich:eia` → `sync:eia` pipeline. EIA-861 XLSX files downloaded from [eia.gov/electricity/data/eia861/](https://www.eia.gov/electricity/data/eia861/) |

### 2. ISOs / RTOs

| Field | Value |
|-------|-------|
| **Description** | The 7 US Independent System Operators / Regional Transmission Organizations: CAISO, ERCOT, ISO-NE, MISO, NYISO, PJM, SPP. Includes boundary polygons and regional linkages. |
| **Record Count** | 7 entities |
| **Schema** | `id`, `slug`, `name`, `shortName`, `website`, `regionId`, boundary polygon reference |
| **Source** | Notion Knowledge Base + ArcGIS boundaries |
| **Format** | JSON (`data/isos.json`, `data/rtos.json`) + GeoJSON territory files |
| **Coverage** | Continental US |
| **Update Frequency** | Rarely changes (structural data) |
| **License** | Public domain |
| **How We Get It** | `sync:notion` → `sync:arcgis` |

### 3. Balancing Authorities

| Field | Value |
|-------|-------|
| **Description** | 45 structural balancing authorities responsible for maintaining load-generation balance within their control areas. Includes EIA codes and control area boundary polygons. |
| **Record Count** | 45 entities |
| **Schema** | `id`, `slug`, `name`, `eiaCode`, `controlAreaBoundary` (GeoJSON reference) |
| **Source** | EIA-861 `Balancing_Authority_2024.xlsx` + HIFLD Control Areas ArcGIS |
| **Format** | JSON (`data/balancing-authorities.json`) + GeoJSON territory files |
| **Coverage** | Continental US |
| **Update Frequency** | Annual |
| **License** | Public domain (US government data) |
| **How We Get It** | `sync:ba` script |

### 4. Regions (Service Territories, ISO Regions, CCAs, BA Areas)

| Field | Value |
|-------|-------|
| **Description** | Geographic regions representing various grid boundaries — utility service territories, ISO/RTO regions, Community Choice Aggregator (CCA) territories, and balancing authority control areas. |
| **Record Count** | ~3,000 regions |
| **Schema** | Region metadata with type classification and boundary linkages |
| **Source** | HIFLD Electric Retail Service Territories ArcGIS + CEC (California CCAs) + HIFLD Control Areas |
| **Format** | JSON (`data/regions.json`) |
| **Coverage** | US (California-specific for CCAs) |
| **Update Frequency** | Annual (service territories); as-needed (ISO/CCA changes) |
| **License** | Public domain |
| **How We Get It** | `sync:arcgis` → `sync:cca` → `sync:ba` |

### 5. Territory GeoJSON Boundaries

| Field | Value |
|-------|-------|
| **Description** | ~3,000 GeoJSON polygon files representing geographic boundaries for utility service territories (by EIA ID), ISO/RTO boundaries, CCA territories, and BA control areas. |
| **File Count** | ~3,000 files |
| **Naming Convention** | `{eiaId}.json` (utilities), `iso-{shortName}.json` (ISOs), `cca-{slug}.json` (CCAs), `ba-{slug}.json` (BAs) |
| **Source** | HIFLD ArcGIS (service territories + control areas) + CEC ArcGIS (CCAs) |
| **Format** | GeoJSON (compact, in `public/data/territories/`) |
| **Coverage** | Continental US |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **How We Get It** | `sync:arcgis`, `sync:cca`, `sync:ba` |

### Data Sources Currently In Use

| Source | URL | What We Use It For |
|--------|-----|-------------------|
| **EIA Form 861 (2024)** | https://www.eia.gov/electricity/data/eia861/ | Utility entity data, customer counts, sales, revenue, peak demand, BA codes, NERC regions, meter counts, demand response, net metering, mergers |
| **HIFLD Electric Retail Service Territories** | https://hifld-geoplatform.opendata.arcgis.com/datasets/electric-retail-service-territories | Utility service territory boundary polygons |
| **HIFLD Control Areas** | https://hifld-geoplatform.opendata.arcgis.com/datasets/electric-planning-areas | Balancing authority control area boundaries |
| **CEC Load Serving Entities (ArcGIS)** | https://cecgis-caenergy.opendata.arcgis.com/ | California CCA territory boundaries |
| **Notion Knowledge Base** | Internal | Curated utility/ISO metadata, logos, websites, relationships |

---

## Planned / In Progress

### 1. Generation & Power Plants

#### EIA Form 860 — Annual Electric Generator Report
| Field | Value |
|-------|-------|
| **Description** | Generator-level data for all US power plants ≥1 MW combined nameplate capacity. Includes plant location, generator specs, fuel type, capacity, ownership, in-service dates, energy storage details, wind/solar-specific data, environmental equipment, and proposed/retired generators. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/data/eia860/ |
| **Format** | ZIP containing XLSX files (Utility, Plant, Generator, Wind, Solar, Energy Storage, MultiFuel, Owner, Environmental) |
| **Coverage** | All US states + territories |
| **Update Frequency** | Annual (final data ~September; preliminary monthly via EIA-860M) |
| **License** | Public domain (US government) |
| **Notes** | ~10,000+ generators. Includes proposed generators and recently retired ones. Construction cost data collected since 2013. The preliminary monthly version (EIA-860M) at https://www.eia.gov/electricity/data/eia860m/ provides near-real-time generator inventory updates. |

#### EIA Form 923 — Power Plant Operations Report
| Field | Value |
|-------|-------|
| **Description** | Monthly and annual plant-level data on electricity generation, fuel consumption, fuel stocks, fuel receipts and costs. Covers ~3,034 monthly plants + ~9,528 annual plants. Includes schedules for fuel receipts, generator data, fossil fuel stocks, and environmental data. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/data/eia923/ |
| **Format** | ZIP containing XLSX files |
| **Coverage** | All US states + territories |
| **Update Frequency** | Monthly (preliminary) and Annual (final) |
| **License** | Public domain (US government) |
| **Notes** | Combines what was previously EIA-906, EIA-920, and FERC-423. Essential for actual generation output, heat rates, and fuel cost analysis. Links to EIA-860 via plant/generator codes. |

#### EIA-860M — Monthly Electric Generator Inventory
| Field | Value |
|-------|-------|
| **Description** | Preliminary monthly updates to the generator inventory. Includes newly operating, proposed, and retired generators reported since the last annual EIA-860. Comprehensive list of retirements since 2002. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/data/eia860m/ |
| **Format** | XLSX |
| **Coverage** | US |
| **Update Frequency** | Monthly |
| **License** | Public domain |
| **Notes** | Best source for tracking new capacity additions and retirements in near-real-time. |

#### EPA eGRID — Emissions & Generation Resource Integrated Database
| Field | Value |
|-------|-------|
| **Description** | Comprehensive plant-level data on emissions (CO₂, NOₓ, SO₂, CH₄, N₂O, Hg, PM₂.₅, NH₃, VOCs), generation, heat input, resource mix, and emission rates for almost all US grid-connected power plants. Aggregated at generator, plant, state, NERC region, BA, and eGRID subregion levels. |
| **Source** | US Environmental Protection Agency |
| **URL** | https://www.epa.gov/egrid |
| **Download** | https://www.epa.gov/egrid/detailed-data |
| **GitHub** | https://github.com/USEPA/egrid |
| **Format** | XLSX (multiple aggregation levels), plus R scripts for reproduction |
| **Coverage** | US (plants ≥1 MW combined capacity) |
| **Update Frequency** | Annual (latest: eGRID2023, released 2024, revised June 2025) |
| **License** | Public domain (US government) |
| **Notes** | Gold standard for grid emissions analysis. Eight aggregation levels from individual generators up to NERC region. Underlying data comes from EPA CAMD and EIA Forms 860/923. |

#### WRI Global Power Plant Database
| Field | Value |
|-------|-------|
| **Description** | Global database of ~35,000 power plants across 167 countries. Includes plant name, location (lat/lon), capacity (MW), primary fuel, owner, generation data (2013–2017), and data source. |
| **Source** | World Resources Institute |
| **URL** | https://datasets.wri.org/datasets/global-power-plant-database |
| **GitHub** | https://github.com/wri/global-power-plant-database |
| **Format** | CSV, GeoJSON |
| **Coverage** | Global (167 countries) |
| **Update Frequency** | Irregular (last major update was v1.3.0 in June 2021 — may be stale) |
| **License** | CC-BY 4.0 |
| **Notes** | Great for international coverage but US data is sourced from EIA (so somewhat redundant domestically). Last updated 2021 — check if newer versions exist. Generation data only through 2017. |

#### HIFLD Power Plants
| Field | Value |
|-------|-------|
| **Description** | Locations of power plants in the US with attributes including plant name, primary fuel, capacity, operator, and geographic coordinates. |
| **Source** | Homeland Infrastructure Foundation-Level Data (DHS) |
| **URL** | https://hifld-geoplatform.opendata.arcgis.com/datasets/power-plants |
| **Format** | ArcGIS Feature Service, Shapefile, GeoJSON, CSV |
| **Coverage** | US |
| **Update Frequency** | Periodic |
| **License** | Public domain (US government) |
| **Notes** | Derived from EIA data. Useful for geospatial analysis but EIA-860 is more authoritative for detailed plant/generator data. |

---

### 2. Transmission & Substations

#### HIFLD Electric Power Transmission Lines
| Field | Value |
|-------|-------|
| **Description** | Transmission line routes for lines operating at 69 kV to 765 kV. Includes voltage, owner/operator where available. Underground lines included where publicly available. |
| **Source** | Homeland Infrastructure Foundation-Level Data (DHS) |
| **URL** | https://hifld-geoplatform.opendata.arcgis.com/datasets/electric-power-transmission-lines |
| **Format** | ArcGIS Feature Service, Shapefile, GeoJSON |
| **Coverage** | US |
| **Update Frequency** | Periodic |
| **License** | Public domain (US government) |
| **Notes** | The primary open US transmission line dataset. Quality varies by region. Some lines may be missing or have inaccurate routing. |

#### HIFLD Electric Substations
| Field | Value |
|-------|-------|
| **Description** | Locations and attributes of electric power substations ≥69 kV. Lower voltage substations included where publicly available. |
| **Source** | Homeland Infrastructure Foundation-Level Data (DHS) |
| **URL** | https://hifld-geoplatform.opendata.arcgis.com/datasets/electric-substations |
| **Format** | ArcGIS Feature Service, Shapefile, GeoJSON |
| **Coverage** | US |
| **Update Frequency** | Periodic |
| **License** | Public domain (US government) |
| **Notes** | ⚠️ **As of April 2023, HIFLD reclassified the Electric Substations layer as a secured dataset.** It is no longer publicly available without special permission via the HIFLD Secure portal. Alternative: use OpenStreetMap data (see below). The transmission lines dataset remains public. |

#### OpenStreetMap Power Infrastructure
| Field | Value |
|-------|-------|
| **Description** | Community-mapped power infrastructure including transmission lines, substations, power plants, transformers, and distribution infrastructure worldwide. Visualized at [Open Infrastructure Map](https://openinframap.org/). |
| **Source** | OpenStreetMap contributors |
| **URL** | https://www.openstreetmap.org/ |
| **Query Tool** | https://overpass-turbo.eu/ (for small extracts) |
| **Visualization** | https://openinframap.org/ |
| **Commercial Exports** | https://www.infrageomatics.com/products |
| **Format** | OSM PBF (raw); GeoJSON via Overpass API; Shapefile/GeoPackage via Infrageomatics |
| **Coverage** | Global (quality varies significantly by region — excellent in Europe, good in US, sparse in developing countries) |
| **Update Frequency** | Continuous (community-edited) |
| **License** | ODbL (Open Database License) — requires attribution and share-alike |
| **Notes** | Best open source for global power infrastructure. For US substations, this may be the best remaining open alternative after HIFLD secured theirs. Processing raw OSM data at scale requires tools like Imposm3 or osm2pgsql. Small extracts via Overpass Turbo are straightforward. Tag schema: `power=line`, `power=substation`, `power=plant`, `power=generator`, `power=tower`, etc. |

---

### 3. Grid Operations & Market Data

#### EIA-930 — Hourly Electric Grid Monitor
| Field | Value |
|-------|-------|
| **Description** | Hourly demand, generation by fuel type, and interchange data for all US balancing authorities. Provides near-real-time visibility into grid operations. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/gridmonitor/ |
| **API** | `https://api.eia.gov/v2/electricity/rto/` (multiple sub-routes for demand, fuel-type, interchange) |
| **Format** | JSON API, CSV download, interactive dashboard |
| **Coverage** | All US balancing authorities in the Lower 48 |
| **Update Frequency** | Hourly (with ~1-2 hour lag) |
| **License** | Public domain (US government) |
| **Notes** | Incredible dataset for real-time grid analysis. Sub-BA data also available since 2024. API returns max 5,000 rows per request. Data available back to mid-2015. Already integrated into PUDL. |

#### EIA Open Data API v2 — Electricity Routes
| Field | Value |
|-------|-------|
| **Description** | RESTful API providing access to all EIA electricity data series — retail sales, prices, generation, capacity, fuel consumption, state profiles, and more. Hundreds of data series with flexible querying. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/opendata/ |
| **API Docs** | https://www.eia.gov/opendata/documentation.php |
| **API Base** | `https://api.eia.gov/v2/electricity/` |
| **Format** | JSON (default), XML |
| **Coverage** | US (national, state, utility, plant levels) |
| **Update Frequency** | Varies by series (monthly, annual, hourly for RTO data) |
| **License** | Public domain (US government) |
| **Notes** | Free API key required (instant registration). Max 5,000 rows per request with pagination. Key routes: `/retail-sales`, `/electric-power-operational-data`, `/rto/`, `/state-electricity-profiles`. This is the programmatic gateway to essentially all EIA electricity data. |

#### Individual ISO Data Portals

Each ISO/RTO publishes its own market and operational data. These are the authoritative primary sources for real-time and historical grid data:
| ISO | Data Portal URL | Key Data Available |
|-----|----------------|-------------------|
| **CAISO** (OASIS) | http://oasis.caiso.com/ | LMP, transmission, outages, load, generation |
| **ERCOT** | https://www.ercot.com/gridinfo | Load, generation, prices, fuel mix, outages |
| **ISO-NE** | https://www.iso-ne.com/isoexpress/ | LMP, load, generation, capacity, fuel mix |
| **MISO** | https://www.misoenergy.org/markets-and-operations/ | LMP, load, generation, outages |
| **NYISO** | https://www.nyiso.com/public/markets_operations/market_data/custom_report/index.jsp | LMP, load, generation, fuel mix |
| **PJM** (Data Miner 2) | https://dataminer2.pjm.com/ | LMP, load, generation, capacity, FTRs |
| **SPP** | https://marketplace.spp.org/ | LMP, load, generation, transmission |

---

### 4. Emissions & Environmental

#### EPA CEMS — Continuous Emissions Monitoring System
| Field | Value |
|-------|-------|
| **Description** | Hourly emissions data (SO₂, NOₓ, CO₂) and operational data (heat input, gross load, steam load) for fossil-fuel-fired units. The most granular temporal emissions data available for US power plants. |
| **Source** | EPA Clean Air Markets Division (CAMD) |
| **URL** | https://campd.epa.gov/ |
| **API** | https://www.epa.gov/power-sector/cam-api-portal |
| **Bulk Download** | https://campd.epa.gov/data/bulk-data-files |
| **Format** | CSV (bulk), JSON API |
| **Coverage** | US fossil-fuel power plants (required reporters) |
| **Update Frequency** | Quarterly (with ~1 quarter lag) |
| **License** | Public domain (US government) |
| **Notes** | Massive dataset (billions of hourly records since 1995). Essential for granular emissions tracking. Already integrated into PUDL. Use the bulk download files for historical analysis — the API is better for targeted queries. |

#### WattTime API
| Field | Value |
|-------|-------|
| **Description** | Real-time and historical marginal emission rates for electricity grids. Provides the marginal operating emissions rate (MOER) — the emissions impact of consuming one additional unit of electricity at a specific time and location. |
| **Source** | WattTime (nonprofit) |
| **URL** | https://www.watttime.org/ |
| **API Docs** | https://docs.watttime.org/ |
| **Format** | JSON API |
| **Coverage** | US (all grid regions), expanding internationally |
| **Update Frequency** | Real-time (5-minute intervals) |
| **License** | Free tier available (current data only); paid plans for historical data and forecasts |
| **Notes** | Industry standard for real-time marginal emissions. Free tier provides current signal + basic grid region data. Pro tier ($) needed for historical data, forecasts, and health damage data. |

#### Electricity Maps (formerly electricityMap)
| Field | Value |
|-------|-------|
| **Description** | Real-time carbon intensity of electricity consumption/production for grid zones worldwide. Shows electricity flow between zones, generation mix, and carbon intensity. |
| **Source** | Electricity Maps |
| **URL** | https://app.electricitymaps.com/ |
| **API Docs** | https://docs.electricitymaps.com/ |
| **GitHub** | https://github.com/electricitymaps/electricitymaps-contrib |
| **Format** | JSON API; open-source data pipeline |
| **Coverage** | Global (~200+ zones across 70+ countries) |
| **Update Frequency** | Real-time (hourly or better) |
| **License** | Free tier (limited); commercial API for production use. Contribution pipeline is open source (MIT). |
| **Notes** | Their open-source repo contains the parsers and zone definitions. The API itself has rate limits on the free tier. Excellent for international carbon intensity data. Methodology is transparent. |

#### Singularity Energy — Carbon Analytics
| Field | Value |
|-------|-------|
| **Description** | Grid carbon analytics including marginal and average emission rates, power flow tracking, and clean energy matching. |
| **Source** | Singularity Energy |
| **URL** | https://singularity.energy/ |
| **Format** | API |
| **Coverage** | US and expanding |
| **Update Frequency** | Real-time |
| **License** | Commercial API (some free/academic access may be available) |
| **Notes** | Competes with WattTime. Provides both marginal and average emissions. Check for academic/research pricing. |

---

### 5. Rates, Tariffs & Retail Data

#### NREL Utility Rate Database (URDB)
| Field | Value |
|-------|-------|
| **Description** | Comprehensive database of US utility rate structures. Contains detailed tariff information including energy charges, demand charges, time-of-use periods, tiered rates, and more. Used by NREL's System Advisor Model (SAM) and other analysis tools. |
| **Source** | National Renewable Energy Laboratory (NREL) |
| **URL** | https://openei.org/wiki/Utility_Rate_Database |
| **API** | https://api.openei.org/utility_rates |
| **Format** | JSON API |
| **Coverage** | US (most major utilities) |
| **Update Frequency** | Ongoing community updates (not comprehensive — some rates are stale) |
| **License** | CC-BY (Creative Commons Attribution) |
| **Notes** | The most comprehensive open rate database available, but coverage is incomplete and some entries are outdated. Requires NREL API key. Rate structures are complex (JSON objects with nested tier/TOU structures). |

#### NREL Utility Rates API (v3)
| Field | Value |
|-------|-------|
| **Description** | Returns annual average utility rates ($/kWh) for residential, commercial, and industrial sectors plus local utility name for a given lat/lon. Simple flat rate lookup. |
| **Source** | NREL / Ventyx Research / EIA |
| **URL** | https://developer.nrel.gov/docs/electricity/utility-rates-v3/ |
| **Format** | JSON, XML |
| **Coverage** | US |
| **Update Frequency** | ⚠️ **Data is from 2012 and there are currently no plans to update** |
| **License** | Public (NREL API terms) |
| **Notes** | Simple API for quick rate lookups by location, but extremely stale (2012 data). Use EIA-861 retail price data for current rates, or URDB for detailed rate structures. |

#### EIA Electric Sales, Revenue, and Average Price
| Field | Value |
|-------|-------|
| **Description** | Retail electricity sales (MWh), revenue ($), customer counts, and average price (¢/kWh) by state, utility, and sector. Monthly and annual data. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/sales_revenue_price/ |
| **API** | `https://api.eia.gov/v2/electricity/retail-sales` |
| **Format** | XLSX, PDF, JSON API |
| **Coverage** | US (state + utility level) |
| **Update Frequency** | Monthly (EIA-861M) and Annual (EIA-861) |
| **License** | Public domain |
| **Notes** | Most current and authoritative source for US retail electricity prices. Average monthly bills by state available. |

#### OpenEI Utility Rate Data
| Field | Value |
|-------|-------|
| **Description** | Broader OpenEI platform hosting utility rate data, interconnection standards, and other energy information contributed by the community. |
| **Source** | DOE / NREL Open Energy Information |
| **URL** | https://openei.org/ |
| **Format** | Various (wiki-style, JSON API) |
| **Coverage** | US primarily |
| **Update Frequency** | Community-driven |
| **License** | CC-BY |
| **Notes** | Useful for supplementary rate information. Quality varies by contribution. |

---

### 6. Renewable Energy & Distributed Energy Resources

#### NREL National Solar Radiation Database (NSRDB)
| Field | Value |
|-------|-------|
| **Description** | Hourly and half-hourly solar irradiance data (GHI, DNI, DHI), meteorological data, and derived solar resource data at 4km×4km grid resolution. Covers 1998–present. |
| **Source** | National Renewable Energy Laboratory |
| **URL** | https://nsrdb.nrel.gov/ |
| **API** | https://developer.nrel.gov/docs/solar/nsrdb/ |
| **Format** | CSV, HDF5, JSON API |
| **Coverage** | Americas, South Asia, parts of other regions |
| **Update Frequency** | Annual (new years added; historical data may be reprocessed) |
| **License** | Public domain (US government-funded) |
| **Notes** | Essential for solar resource assessment and PV modeling. Pairs with NREL's System Advisor Model (SAM). Free API key required. |

#### NREL Wind Integration National Dataset (WIND Toolkit)
| Field | Value |
|-------|-------|
| **Description** | Modeled wind resource data at 5-minute resolution for 126,000+ sites across the US. Includes wind speed, direction, temperature, pressure at multiple hub heights. |
| **Source** | National Renewable Energy Laboratory |
| **URL** | https://www.nrel.gov/grid/wind-toolkit.html |
| **API** | https://developer.nrel.gov/docs/wind/wind-toolkit/ |
| **Format** | HDF5, CSV, JSON API |
| **Coverage** | Continental US |
| **Update Frequency** | Periodic (historical dataset, 2007–2014 base period) |
| **License** | Public domain |
| **Notes** | High-resolution wind resource data for wind energy analysis. Also available on AWS Open Data. |

#### NREL Annual Technology Baseline (ATB)
| Field | Value |
|-------|-------|
| **Description** | Technology cost and performance projections for electricity generation technologies (solar, wind, battery, natural gas, nuclear, etc.) used in energy system modeling. Includes LCOE projections through 2050. |
| **Source** | National Renewable Energy Laboratory |
| **URL** | https://atb.nrel.gov/ |
| **Data Download** | https://atb.nrel.gov/electricity/2024/data |
| **Format** | XLSX, CSV, Parquet (via PUDL) |
| **Coverage** | US (technology-specific, not geographic) |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **Notes** | Standard reference for energy technology cost assumptions. Integrated into PUDL. Essential for capacity expansion modeling and LCOE comparisons. |

#### EIA-861 Net Metering Data
| Field | Value |
|-------|-------|
| **Description** | Net metering program statistics by utility, state, and sector. Includes number of customers, installed capacity, and energy sold back to grid. A proxy for distributed solar adoption. |
| **Source** | US Energy Information Administration (within EIA-861) |
| **URL** | https://www.eia.gov/electricity/data/eia861/ (Net_Metering file) |
| **Format** | XLSX |
| **Coverage** | US |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **Notes** | Best available national-scale data on distributed solar/DER adoption at the utility level. |

#### LBNL Tracking the Sun
| Field | Value |
|-------|-------|
| **Description** | Project-level data on distributed solar PV installations in the US, including system size, cost, installer, module/inverter info, and customer type. |
| **Source** | Lawrence Berkeley National Laboratory |
| **URL** | https://emp.lbl.gov/tracking-the-sun |
| **Format** | CSV |
| **Coverage** | US (~30 states, representing ~80% of US distributed PV market) |
| **Update Frequency** | Annual |
| **License** | Public (LBNL/DOE) |
| **Notes** | Individual installation-level data. Some fields suppressed for privacy. Great for analyzing distributed solar cost trends and market dynamics. |

#### LBNL Land-Based Wind Market Report Data
| Field | Value |
|-------|-------|
| **Description** | Detailed data on US wind power installations, costs, performance, and market trends. Project-level data for utility-scale wind. |
| **Source** | Lawrence Berkeley National Laboratory |
| **URL** | https://emp.lbl.gov/wind-technologies-market-report |
| **Format** | XLSX |
| **Coverage** | US |
| **Update Frequency** | Annual |
| **License** | Public (LBNL/DOE) |
| **Notes** | Companion to "Tracking the Sun" but for wind. Includes capacity factors, PPA prices, and technology trends. |

---

### 7. EV Charging Infrastructure

#### DOE AFDC Alternative Fuel Station Locator
| Field | Value |
|-------|-------|
| **Description** | Comprehensive database of alternative fuel stations in the US and Canada, including EV charging stations. Includes station location, network, connector types, power level (L1/L2/DCFC), access type, and hours. |
| **Source** | US Department of Energy / NREL Alternative Fuels Data Center |
| **URL** | https://afdc.energy.gov/stations |
| **API** | https://developer.nrel.gov/docs/transportation/alt-fuel-stations-v1/ |
| **Format** | JSON API, CSV download |
| **Coverage** | US + Canada |
| **Update Frequency** | Continuously updated (station operators submit data) |
| **License** | Public domain (US government) |
| **Notes** | The authoritative source for EV charging station locations in the US. ~70,000+ EV charging locations. API key required (free from NREL). Filter by fuel type, connector type, network, state, etc. |

#### Open Charge Map
| Field | Value |
|-------|-------|
| **Description** | Community-driven global registry of EV charging locations. |
| **Source** | Open Charge Map (community project) |
| **URL** | https://openchargemap.org/ |
| **API** | https://openchargemap.org/site/develop/api |
| **Format** | JSON API |
| **Coverage** | Global (~300,000+ locations) |
| **Update Frequency** | Continuous (community-contributed) |
| **License** | CC-BY-SA |
| **Notes** | Best open global source for EV charging data. Quality varies by region. US data may lag AFDC. |

---

### 8. Energy Storage

#### DOE Global Energy Storage Database (GESDB)
| Field | Value |
|-------|-------|
| **Description** | Database of energy storage projects worldwide. Includes technology type, rated power (kW), energy capacity (kWh), status, application, location, and commissioning date. |
| **Source** | Sandia National Laboratories / US DOE |
| **URL** | https://sandia.gov/ess-ssl/gesdb/public/ |
| **Statistics** | https://sandia.gov/ess-ssl/gesdb/public/statistics.html |
| **Format** | Web interface (no bulk download API currently) |
| **Coverage** | Global |
| **Update Frequency** | Periodic (check for latest update; data may lag) |
| **License** | Public (US government-funded) |
| **Notes** | ⚠️ The database may not have a straightforward bulk data export. Web scraping or manual download may be needed. Verify current data access options — the site has historically had limited programmatic access. |

#### EIA-860 Energy Storage Data
| Field | Value |
|-------|-------|
| **Description** | Generator-level data for energy storage installations (batteries, pumped hydro, flywheels, compressed air) as part of the annual EIA-860 survey. Includes rated power, energy capacity, technology type, and status. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/data/eia860/ (file `3_4_Energy_Storage`) |
| **Format** | XLSX |
| **Coverage** | US (plants ≥1 MW) |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **Notes** | Most authoritative source for utility-scale energy storage in the US. Track this alongside EIA-860M for near-real-time additions. |

---

### 9. Interconnection Queues

#### LBNL Queues — Electricity Markets & Policy
| Field | Value |
|-------|-------|
| **Description** | Compiled and cleaned interconnection queue data from all 7 US ISOs/RTOs plus some non-ISO utilities. Tracks proposed generation and storage projects waiting to connect to the grid. Includes capacity, fuel type, status, request date, and estimated in-service date. |
| **Source** | Lawrence Berkeley National Laboratory |
| **URL** | https://emp.lbl.gov/queues |
| **Data** | https://emp.lbl.gov/queues-data (downloadable) |
| **Format** | XLSX |
| **Coverage** | US (ISO/RTO queues + some non-ISO) |
| **Update Frequency** | ~Quarterly/Annual |
| **License** | Public (LBNL/DOE) |
| **Notes** | The definitive cleaned dataset for interconnection queue analysis. Raw queue data from individual ISOs is messy and inconsistent — LBNL standardizes it. Essential for understanding the pipeline of future generation additions. As of 2024, there was >2,600 GW in the US interconnection queues (mostly solar, wind, and storage). |

#### Individual ISO Interconnection Queue Portals
| ISO | Queue URL |
|-----|----------|
| **CAISO** | https://rimspub.caiso.com/rimsui/logon.do |
| **ERCOT** | https://www.ercot.com/gridinfo/resource |
| **ISO-NE** | https://irtt.iso-ne.com/reports/external |
| **MISO** | https://www.misoenergy.org/planning/generator-interconnection/GI_Queue/ |
| **NYISO** | https://www.nyiso.com/interconnections |
| **PJM** | https://www.pjm.com/planning/service-requests/interconnection-queues |
| **SPP** | https://www.spp.org/engineering/generator-interconnection/ |

---

### 10. Reliability & Outages

#### EIA-861 Reliability Data
| Field | Value |
|-------|-------|
| **Description** | Utility-reported reliability metrics including SAIDI (System Average Interruption Duration Index), SAIFI (System Average Interruption Frequency Index), and CAIDI. Collected via EIA-861 Schedule of Reliability. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/data/eia861/ (Reliability file) |
| **Format** | XLSX |
| **Coverage** | US (utilities reporting to EIA-861) |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **Notes** | Primary source for standardized US utility reliability metrics. Data quality varies — some utilities report with and without major event days separately. |

#### DOE OE-417 Electric Emergency and Disturbance Reports
| Field | Value |
|-------|-------|
| **Description** | Reports of major electric disturbances and unusual occurrences reported to DOE. Includes cause, affected area, customers affected, demand loss, and duration. |
| **Source** | US Department of Energy, Office of Electricity |
| **URL** | https://www.oe.netl.doe.gov/OE417_annual_summary.aspx |
| **Format** | XLSX, PDF |
| **Coverage** | US |
| **Update Frequency** | Annual (compiled from real-time reporting) |
| **License** | Public domain |
| **Notes** | Covers events ≥50,000 customers or ≥300 MW lost. Good for major event analysis but doesn't capture routine outages. |

#### NERC State of Reliability Report
| Field | Value |
|-------|-------|
| **Description** | Annual assessment of bulk power system reliability. Includes metrics on transmission outages, generation adequacy, and system events. |
| **Source** | North American Electric Reliability Corporation |
| **URL** | https://www.nerc.com/pa/RAPA/PA/Pages/default.aspx |
| **Format** | PDF (report); some supporting data in spreadsheets |
| **Coverage** | North America (US, Canada, parts of Mexico) |
| **Update Frequency** | Annual |
| **License** | Public (NERC is a non-governmental regulatory authority) |
| **Notes** | High-level reliability assessment. Underlying event data (GADS, TADS) requires NERC membership or data request. |

#### PowerOutage.us
| Field | Value |
|-------|-------|
| **Description** | Aggregated real-time power outage data scraped from utility outage maps across the US. Tracks customers without power by utility, county, and state. |
| **Source** | PowerOutage.us (independent project) |
| **URL** | https://poweroutage.us/ |
| **API** | https://poweroutage.us/about/api (paid) |
| **Format** | JSON API (paid), web dashboard (free) |
| **Coverage** | US (~95% of electric customers) |
| **Update Frequency** | Real-time (~15-minute intervals) |
| **License** | Commercial API (paid); website free for viewing |
| **Notes** | Great for real-time outage monitoring. Historical data available via paid API. Independently operated — not an official government source. |

---

### 11. Demand Response & Energy Efficiency

#### EIA-861 Demand Response Data
| Field | Value |
|-------|-------|
| **Description** | Demand response program enrollment, energy savings, peak savings (potential and actual), and program costs by utility, state, sector, and balancing authority. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/data/eia861/ (Demand_Response file) |
| **Format** | XLSX |
| **Coverage** | US |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **Notes** | Best national-level data on demand response programs. Collected since 2013 in current format. |

#### EIA-861 Energy Efficiency Data
| Field | Value |
|-------|-------|
| **Description** | Energy efficiency program data including incremental energy savings, peak demand savings, weighted average life cycle, and costs for utility-administered programs. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/data/eia861/ (Energy_Efficiency file) |
| **Format** | XLSX |
| **Coverage** | US |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **Notes** | Useful for understanding utility DSM (demand-side management) portfolios. |

#### EIA-861 Dynamic Pricing Data
| Field | Value |
|-------|-------|
| **Description** | Number of customers enrolled in dynamic pricing programs: time-of-use, real-time pricing, variable peak pricing, critical peak pricing, and critical peak rebates. |
| **Source** | US Energy Information Administration |
| **URL** | https://www.eia.gov/electricity/data/eia861/ (Dynamic_Pricing file) |
| **Format** | XLSX |
| **Coverage** | US |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **Notes** | Indicates adoption of advanced rate structures. |

---

### 12. Regulatory & FERC Data

#### FERC Form 1 — Electric Utility Annual Report
| Field | Value |
|-------|-------|
| **Description** | Detailed financial and operational data for major US electric utilities (Class A and B). Includes income statements, balance sheets, rate base, depreciation, O&M expenses, sales for resale, purchased power, generating plant statistics, and transmission/distribution data. |
| **Source** | Federal Energy Regulatory Commission |
| **URL** | https://www.ferc.gov/industries-data/electric/general-information/electric-industry-forms/form-1-electric-utility-annual |
| **Data** | https://eforms.ferc.gov/eforms/form1viewer |
| **PUDL** | Fully processed in PUDL (SQLite + Parquet) |
| **Format** | Visual FoxPro database (raw); SQLite/Parquet (via PUDL) |
| **Coverage** | US (major electric utilities — ~200 entities) |
| **Update Frequency** | Annual (filed ~April for prior year) |
| **License** | Public domain (US government) |
| **Notes** | Extremely detailed financial data but notoriously difficult to work with in raw format (Visual FoxPro DBF files). **Strongly recommend using PUDL's processed version.** Essential for utility financial analysis, rate cases, and cost-of-service studies. |

#### FERC Form 714 — Annual Electric Balancing Authority Area and Planning Area Report
| Field | Value |
|-------|-------|
| **Description** | Hourly load data, planning area descriptions, and peak demand data for balancing authorities and planning areas. Includes hourly system load profiles for transmission planning. |
| **Source** | Federal Energy Regulatory Commission |
| **URL** | https://www.ferc.gov/industries-data/electric/general-information/electric-industry-forms/form-no-714-annual-electric/data |
| **PUDL** | Partially processed in PUDL |
| **Format** | CSV (raw); SQLite/Parquet (via PUDL) |
| **Coverage** | US balancing authorities and planning areas |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **Notes** | Valuable for hourly load shape analysis at the BA/planning area level. Historical data back to 2006+. |

#### FERC Form 2 — Natural Gas Pipeline Annual Report
| Field | Value |
|-------|-------|
| **Description** | Financial and operational data for major interstate natural gas pipelines. Relevant to grid analysis because gas pipeline capacity affects gas-fired generation availability. |
| **Source** | Federal Energy Regulatory Commission |
| **URL** | https://www.ferc.gov/industries-data/natural-gas/industry-forms/form-2-2a-3-q-gas-historical-vfp-data |
| **Format** | Visual FoxPro database (raw); SQLite (via PUDL) |
| **Coverage** | US |
| **Update Frequency** | Annual |
| **License** | Public domain |
| **Notes** | Tangential to grid data but relevant for gas-electric coordination analysis. PUDL converts raw VFP to SQLite. |

---

### 13. International Grid Data

#### ENTSO-E Transparency Platform (Europe)
| Field | Value |
|-------|-------|
| **Description** | Comprehensive European electricity market and grid data. Includes generation by type, cross-border flows, day-ahead prices, installed capacity, load, outages, and transmission constraints for all EU/EEA countries. |
| **Source** | European Network of Transmission System Operators for Electricity |
| **URL** | https://transparency.entsoe.eu/ |
| **API** | https://transparency.entsoe.eu/content/static_content/Static%20content/web%20api/Guide.html |
| **Format** | XML/JSON API, CSV downloads |
| **Coverage** | EU/EEA (~35 countries) |
| **Update Frequency** | Real-time to day-ahead |
| **License** | Free registration required; data is public under ENTSO-E terms |
| **Notes** | The European equivalent of combining all US ISO data portals into one. Free API token after registration. Massive amount of data. Python libraries like `entsoe-py` simplify access. |

#### Ember Global Electricity Data
| Field | Value |
|-------|-------|
| **Description** | Monthly and annual electricity generation, capacity, and emissions data for 200+ countries. Provides consistent methodology for global electricity sector analysis. |
| **Source** | Ember (nonprofit energy think tank) |
| **URL** | https://ember-energy.org/data/ |
| **Data Explorer** | https://ember-energy.org/data/data-explorer/ |
| **Format** | CSV, interactive dashboard |
| **Coverage** | Global (200+ countries) |
| **Update Frequency** | Monthly updates, annual comprehensive review |
| **License** | CC-BY-4.0 |
| **Notes** | Excellent for global electricity comparisons. Clean, well-documented data. Good for tracking global energy transition progress. |

#### IEA World Energy Statistics
| Field | Value |
|-------|-------|
| **Description** | Comprehensive global energy statistics covering electricity generation, capacity, trade, and consumption by country. |
| **Source** | International Energy Agency |
| **URL** | https://www.iea.org/data-and-statistics |
| **Format** | CSV, interactive tools |
| **Coverage** | Global |
| **Update Frequency** | Annual |
| **License** | Mixed — some data freely available, detailed datasets require IEA subscription |
| **Notes** | IEA has been making more data publicly available, but full access still requires a subscription. Check their free data offerings. |

#### IRENA Renewable Energy Statistics
| Field | Value |
|-------|-------|
| **Description** | Global renewable energy capacity, generation, and cost data by country and technology. |
| **Source** | International Renewable Energy Agency |
| **URL** | https://www.irena.org/Data |
| **Data Portal** | https://pxweb.irena.org/pxweb/en/IRENASTAT |
| **Format** | PX-Web API, CSV downloads |
| **Coverage** | Global |
| **Update Frequency** | Annual |
| **License** | Free (public data) |
| **Notes** | Best source for global renewable capacity by country. Complementary to Ember's generation data. |

---

### 14. Meta-Sources & Aggregators

#### Catalyst Cooperative PUDL (Public Utility Data Liberation)
| Field | Value |
|-------|-------|
| **Description** | Open-source ETL pipeline that cleans, integrates, and standardizes US energy data from multiple federal sources into analysis-ready SQLite and Parquet databases. Currently processes EIA-860, EIA-861, EIA-923, EIA-930, EIA-176, EPA CEMS, FERC Forms 1/2/6/60/714, and NREL ATB. |
| **Source** | Catalyst Cooperative (nonprofit) |
| **URL** | https://catalyst.coop/pudl/ |
| **GitHub** | https://github.com/catalyst-cooperative/pudl |
| **Data Access** | https://catalystcoop-pudl.readthedocs.io/en/nightly/data_access.html |
| **Kaggle** | https://www.kaggle.com/datasets/catalystcooperative/pudl-project |
| **AWS** | https://registry.opendata.aws/catalyst-cooperative-pudl/ |
| **Format** | SQLite, Apache Parquet, JSON |
| **Coverage** | US (federal data sources) |
| **Update Frequency** | Nightly automated builds from latest raw data |
| **License** | MIT (code); underlying data is public domain |
| **Notes** | **Extremely valuable.** Instead of manually downloading and cleaning EIA/FERC data, PUDL provides it pre-cleaned with consistent entity IDs, foreign key relationships, and unit conversions. Hundreds of tables. Available on Kaggle and AWS Open Data for easy download. Also archives raw inputs on Zenodo for reproducibility. |

#### Open Energy Data Initiative (OEDI)
| Field | Value |
|-------|-------|
| **Description** | DOE's centralized platform for publishing open energy data. Hosts datasets from national labs and DOE programs on topics including solar, wind, buildings, transportation, and grid. |
| **Source** | US Department of Energy |
| **URL** | https://data.openei.org/ |
| **Format** | Various (CSV, JSON, HDF5, Parquet, etc.) |
| **Coverage** | Primarily US |
| **Update Frequency** | Varies by dataset |
| **License** | Varies (mostly public domain or CC-BY) |
| **Notes** | Good discovery portal for DOE-funded datasets. 290+ data providers. Search for specific topics. |

#### Data.gov — Energy Datasets
| Field | Value |
|-------|-------|
| **Description** | The US government's open data portal. Contains energy datasets from EIA, DOE, EPA, FERC, and other agencies. |
| **Source** | US Government |
| **URL** | https://catalog.data.gov/dataset?groups=energy |
| **Format** | Various |
| **Coverage** | US |
| **Update Frequency** | Varies |
| **License** | Public domain (US government) |
| **Notes** | Good for discovery but data quality and freshness varies widely. Often better to go to the source agency directly. |

---

## Gap Analysis

### Data We Need But Don't Have Good Open Sources For

#### 🔴 High Priority Gaps

| Gap | Why It Matters | Current State | Potential Approaches |
|-----|---------------|---------------|---------------------|
| **Distribution-level infrastructure** (feeder lines, distribution substations, transformers, pole locations) | Essential for understanding last-mile grid capacity, DER hosting capacity, and outage analysis at the local level | Almost no open data exists. Distribution infrastructure data is held by individual utilities and rarely published. Some utilities publish hosting capacity maps but not raw infrastructure data. | Monitor utility hosting capacity map portals (many CA utilities publish these per Rule 21); scrape where possible. HIFLD's substation data (now secured) included some distribution-level facilities. OSM has some distribution-level data but coverage is very sparse. |
| **Real-time or near-real-time outage data** (beyond PowerOutage.us) | Critical for reliability analysis, storm response, and customer impact assessment | PowerOutage.us scrapes utility outage maps but is a commercial product. Individual utility outage maps exist but there's no standardized open dataset. DOE OE-417 captures major events but with significant delay. | Build scrapers for individual utility outage map APIs (many utilities use Kubra or OMS platforms with public-facing APIs). Consider partnering with PowerOutage.us or building a similar aggregation layer. |
| **Detailed rate/tariff structures** (machine-readable, comprehensive, current) | Needed for bill calculation, DER economics, and rate comparison tools | NREL URDB exists but is incomplete and partially outdated. No single source has all current US utility tariffs in machine-readable format. | Build utility tariff scrapers (tariffs are public documents, usually PDFs on utility websites). Consider OpenEI contributions. Some startups (Genability/Arcadia) have comprehensive databases but they're commercial. |
| **Grid interconnection queue data** (standardized, real-time) | Understanding the future generation pipeline and grid congestion | LBNL compiles queue data but with lag. Individual ISO queue portals are messy and inconsistent. No open real-time standardized feed exists. | Scrape directly from individual ISO queue portals (each ISO publishes queue data publicly). Supplement with LBNL annual compilation. Consider building a standardized aggregation layer. |

#### 🟡 Medium Priority Gaps

| Gap | Why It Matters | Current State | Potential Approaches |
|-----|---------------|---------------|---------------------|
| **Wholesale market pricing nodes / LMP maps** (static reference data) | Mapping LMP pricing nodes to geographic locations enables spatial market analysis | ISO OASIS systems have this but it's not standardized across ISOs. The underlying node geography varies by ISO. | Scrape LMP data directly from ISO OASIS portals; build node-to-geography mapping from individual ISO GIS files. CAISO, PJM, and MISO publish node location files. |
| **Grid congestion / curtailment data** | Understanding where and when the grid is constrained affects renewable integration and investment decisions | Some ISOs publish congestion reports. CAISO publishes curtailment data. Not standardized. | Scrape ISO-specific congestion/curtailment reports. CAISO: https://www.caiso.com/informed/Pages/ManagingOversupply.aspx |
| **Planned transmission projects** | Future grid topology affects everything from generation siting to market dynamics | FERC Form 715 has some data. Regional planning organizations publish plans. Not in a single standardized dataset. | Compile from ISO regional transmission plans (CAISO TPP, PJM RTEP, MISO MTEP, etc.). |
| **Behind-the-meter solar/storage** (installation-level) | Significant and growing share of capacity is invisible to grid operators | LBNL Tracking the Sun covers distributed solar in ~30 states. No national comprehensive DER registry exists. EIA-861 net metering data is aggregate only. | Combine LBNL Tracking the Sun + state interconnection data (CA NEM, NY, etc.) + Census ACS data for estimation. Some states have DER registries. |
| **Weather data correlated with grid events** | Weather is the primary driver of both load and renewable generation | NOAA has excellent weather data but it's not pre-joined with grid data. | Integrate NOAA weather stations with BA/utility territories. NREL's NSRDB already provides solar-relevant weather. |

#### 🟢 Lower Priority / Nice-to-Have Gaps

| Gap | Why It Matters | Current State | Potential Approaches |
|-----|---------------|---------------|---------------------|
| **State PUC/PSC regulatory filings** | Regulatory decisions affect rates, grid investment, and market structure | Every state PUC has its own filing system with different formats and access methods. No national aggregated source. | Would require state-by-state scraping. Some states have good electronic filing systems (CA CPUC, NY PSC, TX PUCT). Enormous effort to standardize. |
| **Grid-level load profiles** (sub-BA, feeder-level) | Enables granular demand forecasting and DER planning | Very limited. Some utilities publish aggregate load profiles. ISO load data is at the zone level. | Monitor utility data portals. Some utilities participate in DOE's Grid Modernization initiative and publish data. |
| **Electricity trade (international)** | Important for border regions and understanding continental energy flows | EIA publishes some US-Canada/Mexico trade data. ENTSO-E covers European cross-border flows well. | EIA international data + FERC Form 714 (which includes interchange data). |
| **Microgrid installations** | Growing segment of grid infrastructure | No comprehensive open database. DOE tracks some projects. | DOE microgrid program reports; industry surveys. |
| **Hydrogen electrolyzer locations** (emerging) | Growing intersection with grid (large loads) | Very early stage. No comprehensive database. | Monitor DOE hydrogen hub announcements and EIA generator data (electrolyzers starting to appear in EIA-860). |
| **Data center locations and power demand** | Fastest-growing load segment in many regions | No open comprehensive database of data centers with power consumption. Some reporting via EIA-861M. | Monitor industry reports (Synergy Research, etc.); some data centers appear in interconnection queues. |

### Key Observations

1. **Federal data is excellent** — EIA, EPA, FERC, and DOE provide world-class open energy data for the US. The main challenge is cleaning and integrating it (which PUDL addresses).

2. **The biggest gap is distribution-level data** — Almost everything below the transmission level is proprietary to individual utilities. This is the #1 structural gap in open grid data.

3. **Real-time data is getting better** — EIA-930 (hourly grid monitor), individual ISO data portals, and emissions APIs (WattTime, Electricity Maps) provide increasingly good real-time coverage. But it requires API access and stitching together multiple sources.

4. **International data lags US data** — Europe (via ENTSO-E) is the main exception. Most other regions have limited open grid data.

5. **HIFLD securing substation data is a setback** — The 2023 decision to restrict substation location data means OpenStreetMap is now the best open source for this critical infrastructure layer.

6. **Machine-readable tariffs remain the holy grail** — Despite multiple attempts (URDB, OpenEI), nobody has cracked comprehensive, current, machine-readable tariff data for all US utilities. This is a massive opportunity.

---

## Appendix: Source URLs Quick Reference

| Source | URL |
|--------|-----|
| EIA Electricity Data | https://www.eia.gov/electricity/data.php |
| EIA Open Data API | https://www.eia.gov/opendata/ |
| EIA Form 860 | https://www.eia.gov/electricity/data/eia860/ |
| EIA Form 861 | https://www.eia.gov/electricity/data/eia861/ |
| EIA Form 923 | https://www.eia.gov/electricity/data/eia923/ |
| EIA Grid Monitor (930) | https://www.eia.gov/electricity/gridmonitor/ |
| EPA eGRID | https://www.epa.gov/egrid |
| EPA CEMS (CAMPD) | https://campd.epa.gov/ |
| HIFLD Open Data | https://hifld-geoplatform.opendata.arcgis.com/ |
| FERC Forms | https://www.ferc.gov/industries-data/electric |
| NREL Developer APIs | https://developer.nrel.gov/ |
| NREL NSRDB | https://nsrdb.nrel.gov/ |
| NREL ATB | https://atb.nrel.gov/ |
| NREL URDB | https://openei.org/wiki/Utility_Rate_Database |
| AFDC Station Locator | https://afdc.energy.gov/stations |
| LBNL EMP | https://emp.lbl.gov/ |
| LBNL Queues | https://emp.lbl.gov/queues |
| LBNL Tracking the Sun | https://emp.lbl.gov/tracking-the-sun |
| Catalyst PUDL | https://github.com/catalyst-cooperative/pudl |
| WRI Power Plants | https://datasets.wri.org/datasets/global-power-plant-database |
| OpenStreetMap Power | https://openinframap.org/ |
| Open Energy Data Initiative | https://data.openei.org/ |
| WattTime | https://www.watttime.org/ |
| Electricity Maps | https://app.electricitymaps.com/ |
| ENTSO-E (Europe) | https://transparency.entsoe.eu/ |
| Ember Global Data | https://ember-energy.org/data/ |
| IRENA Statistics | https://www.irena.org/Data |
| DOE GESDB | https://sandia.gov/ess-ssl/gesdb/public/ |
| PowerOutage.us | https://poweroutage.us/ |
| Open Charge Map | https://openchargemap.org/ |
| Sandia GESDB | https://sandia.gov/ess-ssl/gesdb/public/ |

---

## Community Tools

Open-source tools that are useful for working with grid data. These are independent projects — not data sources, but they can help you access and work with the primary sources listed above.

| Tool | License | Description |
|------|---------|-------------|
| [gridstatus](https://github.com/gridstatus/gridstatus) | BSD-3-Clause | Python library providing standardized access to ISO data portals (CAISO, ERCOT, ISO-NE, MISO, NYISO, PJM, SPP). Returns pandas DataFrames. Note: the team behind it also offers a commercial hosted API at gridstatus.io. |
| [PUDL](https://github.com/catalyst-cooperative/pudl) | MIT | Catalyst Cooperative's Public Utility Data Liberation project. Cleans and integrates FERC, EIA, and EPA data into analysis-ready SQLite/Parquet datasets. |
| [Open Infrastructure Map](https://openinframap.org/) | ODbL | Visualization of power infrastructure from OpenStreetMap data. |

---

*This catalog is maintained as part of the OpenGrid project. Contributions and corrections welcome.*
