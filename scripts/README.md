# Sync Scripts

Scripts that pull data from external sources (Notion, ArcGIS, EIA-861 XLSX) and write static JSON files consumed by the opengrid app.

## Data Architecture

### Static data files (`data/*.json`)

| File | Contents | Primary source |
|------|----------|----------------|
| `utilities.json` | All tracked utilities (~900) with EIA fields, linkages | Notion + EIA-861 |
| `isos.json` | 7 US ISOs with region linkages | Notion + ArcGIS |
| `rtos.json` | Copy of ISOs (same entities in US grid) | Notion + ArcGIS |
| `regions.json` | Region metadata (service territories, ISO, CCA, BA) | ArcGIS + CEC + HIFLD |
| `balancing-authorities.json` | 45 structural BAs with EIA codes | EIA-861 + HIFLD |
| `eia-analysis-output.json` | Pre-analyzed EIA-861 data (input only) | Manual analysis |

### Territory GeoJSON (`public/data/territories/*.json`)

| Pattern | Contents | Source |
|---------|----------|--------|
| `{eiaId}.json` | Utility service territory boundary | ArcGIS HIFLD |
| `iso-{shortName}.json` | ISO/RTO boundary | ArcGIS |
| `cca-{slug}.json` | CCA service territory boundary | CEC ArcGIS |
| `ba-{slug}.json` | Balancing authority control area | HIFLD Control Areas |

## Execution Order

Scripts must run in this order because later scripts depend on files written by earlier ones:

```
1. sync:notion     →  utilities.json, isos.json, rtos.json
2. sync:arcgis     →  regions.json, territories/*.json + updates utilities/isos/rtos
3. enrich:eia      →  updates utilities.json (adds missing entities)
4. sync:eia        →  updates utilities.json (populates EIA-861 fields)
5. sync:cca        →  updates regions.json + utilities.json, writes CCA territories
6. sync:ba         →  balancing-authorities.json, updates regions/utilities, writes BA territories
```

Run all in order: `yarn sync:all`

## Script Reference

### `sync-notion.ts` — `yarn sync:notion`

Pulls utilities and ISOs from the Notion Knowledge Base.

- **Source**: Notion API (requires `NOTION_TOKEN`)
- **Outputs**: `utilities.json`, `isos.json`, `rtos.json`
- **Prerequisites**: `export $(cat ../../packages/notion-client/.env | xargs)`

### `sync-arcgis.ts` — `yarn sync:arcgis`

Downloads utility service territory and ISO/RTO boundaries from ArcGIS.

- **Source**: HIFLD Electric Retail Service Territories, Data Center Demand by Region
- **Outputs**: `regions.json`, `territories/{eiaId}.json`, `territories/iso-{name}.json`
- **Updates**: `utilities.json` (serviceTerritoryId), `isos.json`/`rtos.json` (regionId)
- **Prerequisites**: `sync:notion`

### `enrich-eia-entities.ts` — `yarn enrich:eia`

Adds missing utilities from pre-analyzed EIA-861 data and marks stale entries.

- **Source**: `data/eia-analysis-output.json`
- **Updates**: `utilities.json` (adds CCAs, transmission entities, IOU subsidiaries; marks merged/defunct)
- **Prerequisites**: `sync:notion`

### `sync-eia-fields.ts` — `yarn sync:eia`

Populates utility fields from EIA-861 2024 XLSX files.

- **Source**: 5 EIA-861 XLSX files in `~/Workspace/Context data/f8612024/`
- **Updates**: `utilities.json` (peakDemandMw, revenue, sales, baCode, NERC region, meters, etc.)
- **Prerequisites**: `enrich:eia`, EIA-861 XLSX files downloaded from https://www.eia.gov/electricity/data/eia861/

### `sync-cca.ts` — `yarn sync:cca`

Downloads CCA territory boundaries from the California Energy Commission.

- **Source**: CEC Electric Load Serving Entities ArcGIS
- **Outputs**: `territories/cca-{slug}.json`
- **Updates**: `regions.json`, `utilities.json` (serviceTerritoryId for CCAs)
- **Prerequisites**: `sync:arcgis`

### `sync-ba.ts` — `yarn sync:ba`

Downloads Balancing Authority boundaries from HIFLD and builds the BA dataset.

- **Source**: HIFLD Control Areas ArcGIS, EIA-861 Balancing_Authority_2024.xlsx
- **Outputs**: `balancing-authorities.json`, `territories/ba-{slug}.json`
- **Updates**: `regions.json`, `utilities.json` (balancingAuthorityId)
- **Prerequisites**: `sync:eia` (for baCode linkage)

## Shared Utilities (`lib.ts`)

Common functions and constants used across scripts:

- `slugify(name, options?)` — URL-safe slug with optional `stripParentheticals` and `normalizeEmDashes`
- `DATA_DIR` / `TERRITORIES_DIR` — resolved path constants
- `readJSON<T>(filename)` / `writeJSON(filename, data)` — JSON I/O for data directory
- `writeTerritory(filename, data)` — compact GeoJSON writer for territory files
