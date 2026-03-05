# ⚡ CommonGrid

**The open dataset for the US electric grid** — utilities, grid operators, territory boundaries, and more.

**[commongrid.info](https://commongrid.info)** · Built by [Texture](https://texturehq.com), maintained by the community.

[![License](https://img.shields.io/badge/License-ODbL%201.0-brightgreen.svg)](LICENSE)

---

## What's Included

| Dataset | File | Count | Description |
|---------|------|-------|-------------|
| **Utilities** | `data/utilities.json` | 3,132 | Every US electric utility — IOUs, co-ops, munis, CCAs, federal |
| **ISOs** | `data/isos.json` | 7 | Independent System Operators |
| **RTOs** | `data/rtos.json` | 7 | Regional Transmission Organizations |
| **Balancing Authorities** | `data/balancing-authorities.json` | 45 | Balancing authorities with EIA codes |
| **Regions** | `data/regions.json` | 3,000 | Geographic regions — service territories, ISO/RTO/BA boundaries |
| **Territory Boundaries** | `data/territories/*.json` | 3,000+ | GeoJSON boundary files for service territories, ISOs, BAs, CCAs |

All data is JSON. No database required. Clone the repo and start building.

For a detailed breakdown of every field, data source, and what we're planning to add next, see the **[Data Catalog](docs/DATA_CATALOG.md)**.

## Quick Start

### Just want the data?

```bash
git clone https://github.com/TextureHQ/commongrid.git
cd commongrid
```

Then load any JSON file in your language of choice:

```python
import json

with open("data/utilities.json") as f:
    utilities = json.load(f)

print(f"{len(utilities)} utilities")
# → 3132 utilities

# Find all investor-owned utilities in California
ca_ious = [u for u in utilities if u["segment"] == "INVESTOR_OWNED_UTILITY" and u.get("jurisdiction") and "CA" in u["jurisdiction"]]
```

```javascript
import utilities from "./data/utilities.json" assert { type: "json" };

const coops = utilities.filter(u => u.segment === "DISTRIBUTION_COOPERATIVE");
console.log(`${coops.length} distribution cooperatives`);
```

### Want to explore visually?

The site at **[commongrid.info](https://commongrid.info)** is an interactive map and explorer for all the data in this repo.

**Run it locally:**

```bash
npm install
npm run dev
# Open http://localhost:3000
```

> **Note:** The interactive map requires a [Mapbox](https://mapbox.com) access token. Set `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env.local`. Without it, the home page shows a static landing view — all other pages work fine.

---

## Data Schemas

### Utilities (`data/utilities.json`)

Each utility includes identity, classification, operational data, and relationships:

```typescript
{
  id: string;                          // UUID
  slug: string;                        // URL-safe identifier (e.g., "duke-energy")
  name: string;                        // Display name
  eiaName: string | null;              // Name as reported to EIA
  shortName: string | null;            // Abbreviated name
  logo: string | null;                 // Logo URL
  website: string | null;              // Official website
  eiaId: string | null;               // EIA utility ID
  segment: UtilitySegment;             // INVESTOR_OWNED_UTILITY | DISTRIBUTION_COOPERATIVE | MUNICIPAL_UTILITY | ...
  status: UtilityStatus;               // ACTIVE | MERGED | ACQUIRED | DEFUNCT | PENDING
  customerCount: number | null;        // Total retail customers
  peakDemandMw: number | null;         // Summer peak demand (MW)
  winterPeakDemandMw: number | null;   // Winter peak demand (MW)
  totalRevenueDollars: number | null;   // Annual revenue
  totalSalesMwh: number | null;        // Annual sales (MWh)
  baCode: string | null;               // Balancing authority code
  nercRegion: string | null;           // NERC region
  hasGeneration: boolean | null;       // Owns generation assets
  hasTransmission: boolean | null;     // Operates transmission
  hasDistribution: boolean | null;     // Operates distribution
  amiMeterCount: number | null;        // Advanced metering infrastructure count
  totalMeterCount: number | null;      // Total meters
  jurisdiction: string | null;         // States served (e.g., "FL, IN, KY, NC, OH, SC")
  isoId: string | null;               // → ISOs
  rtoId: string | null;               // → RTOs
  balancingAuthorityId: string | null;  // → Balancing Authorities
  generationProviderId: string | null;  // G&T co-op providing generation
  transmissionProviderId: string | null; // Transmission provider
  parentId: string | null;             // Parent utility
  successorId: string | null;          // Successor (if merged/acquired)
  serviceTerritoryId: string | null;   // → Regions
}
```

**Utility segments:**
- `INVESTOR_OWNED_UTILITY` — IOUs (e.g., Duke Energy, PG&E)
- `DISTRIBUTION_COOPERATIVE` — Distribution co-ops
- `GENERATION_AND_TRANSMISSION` — G&T co-ops
- `MUNICIPAL_UTILITY` — City/town-owned utilities
- `COMMUNITY_CHOICE_AGGREGATOR` — CCAs (California)
- `POLITICAL_SUBDIVISION` — State/county utilities
- `TRANSMISSION_OPERATOR` — Transmission-only operators
- `JOINT_ACTION_AGENCY` — Joint action agencies
- `FEDERAL` — Federal utilities (TVA, BPA, WAPA)

### ISOs (`data/isos.json`)

```typescript
{
  id: string;
  slug: string;              // e.g., "caiso"
  name: string;              // e.g., "California Independent System Operator"
  shortName: string;         // e.g., "CAISO"
  states: string[];          // States covered
  website: string | null;
  regionId: string | null;   // → Regions (for boundary GeoJSON)
  logo: string | null;
}
```

### RTOs (`data/rtos.json`)

Same schema as ISOs.

### Balancing Authorities (`data/balancing-authorities.json`)

```typescript
{
  id: string;
  slug: string;              // e.g., "arizona-public-service"
  name: string;              // e.g., "Arizona Public Service"
  shortName: string;         // e.g., "APS"
  eiaCode: string | null;    // e.g., "AZPS"
  eiaId: string | null;
  website: string | null;
  states: string[];
  isoId: string | null;      // → ISOs (if within an ISO)
  regionId: string | null;   // → Regions (for boundary GeoJSON)
  logo: string | null;
}
```

### Regions (`data/regions.json`)

```typescript
{
  id: string;
  slug: string;
  name: string;
  type: RegionType;          // SERVICE_TERRITORY | ISO | BALANCING_AUTHORITY | RTO | CCA_TERRITORY | ...
  eiaId: string | null;
  state: string | null;
  customers: number | null;
  source: string | null;     // Data source (e.g., "ArcGIS HIFLD Electric Retail Service Territories")
  sourceDate: string | null;
}
```

### Territory Boundaries (`data/territories/*.json`)

Each file is a GeoJSON `FeatureCollection` with polygon/multipolygon geometries:

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {
      "id": "region-st-803",
      "name": "ARIZONA PUBLIC SERVICE CO",
      "eiaId": "803",
      "state": "AZ"
    },
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[lng, lat], ...]]
    }
  }]
}
```

**File naming:**
- EIA ID for service territories: `803.json`, `1000.json`
- Prefixed slugs for other types: `ba-caiso.json`, `iso-pjm.json`, `cca-cleanpowersf.json`

---

## Data Sources

All data is sourced from publicly available, authoritative sources:

| Source | URL | What We Use |
|--------|-----|-------------|
| **EIA-861** | [eia.gov/electricity/data/eia861](https://www.eia.gov/electricity/data/eia861/) | Utility identities, customer counts, operational data, relationships |
| **HIFLD** | [hifld-geoplatform.opendata.arcgis.com](https://hifld-geoplatform.opendata.arcgis.com/) | Service territory GeoJSON boundaries |
| **ArcGIS** | [services.arcgis.com](https://services.arcgis.com/) | Electric retail service territory polygons |
| **CEC** | [energy.ca.gov](https://www.energy.ca.gov/) | California Community Choice Aggregator territories |
| **EIA API** | [api.eia.gov](https://api.eia.gov/) | Balancing authority boundaries and codes |

See the [Data Catalog](docs/DATA_CATALOG.md) for detailed source documentation and our roadmap for future datasets (rate structures, generation mix, interconnection queues, and more).

---

## Repository Structure

```
commongrid/
├── README.md                 ← You are here
├── LICENSE                   ← ODbL 1.0
├── data/
│   ├── utilities.json        ← 3,132 utilities
│   ├── isos.json             ← 7 ISOs
│   ├── rtos.json             ← 7 RTOs
│   ├── balancing-authorities.json  ← 45 BAs
│   ├── regions.json          ← 3,000 regions
│   └── territories/          ← 3,000+ GeoJSON boundary files
├── app/                      ← Next.js pages (the commongrid.info site)
│   └── (shell)/              ← Layout with nav, map, detail pages
├── components/               ← React components (TopBar, DataSourceLink, etc.)
├── lib/                      ← Data loading, formatting, geo utilities
├── types/                    ← TypeScript type definitions
├── scripts/                  ← Data sync scripts (EIA, ArcGIS, CCA, etc.)
├── docs/
│   ├── CONTRIBUTING.md       ← How to contribute
│   └── DATA_CATALOG.md       ← Detailed data catalog & gap analysis
└── content/                  ← Concept and planning docs
```

---

## Contributing

We welcome contributions! See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for details on:

- Reporting data issues
- Adding or updating data
- Contributing territory boundaries
- Improving the explorer
- Running sync scripts

## License

CommonGrid data is licensed under the [Open Database License (ODbL) 1.0](LICENSE). See the [full ODbL text](https://opendatacommons.org/licenses/odbl/1-0/) for details.

The underlying data is sourced from US government agencies and public sources. The data itself is not copyrightable — our contribution is the cleaning, normalization, and structuring.

---

Built with ❤️ by [Texture](https://texturehq.com) — the energy operating system.
