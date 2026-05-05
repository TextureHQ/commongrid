# Substations — Data Catalog Addition

**Integration:** Insert the following entry into `DATA_CATALOG.md` under "Currently Available Datasets" after "Territory GeoJSON Boundaries".

---

### 9. Substations

| Field | Value |
|-------|-------|
| **Description** | Comprehensive registry of US electric substations — the interconnection nodes where transmission lines terminate, where power plants inject into the grid, and where LMP pricing nodes are co-located. Includes voltage classification, ownership, status, and interconnection type (transmission/distribution). Primary sources: OpenStreetMap (ODbL-licensed) and EIA public datasets. |
| **Record Count** | ~60,000 US substations (primarily transmission and above-69kV distribution) |
| **Schema** | `id`, `slug`, `name`, `alternateNames`, `latitude`, `longitude`, `latLon` (GeoJSON), `substationType` (transmission/distribution), `status` (operational/retired/planned), `minVoltageKv`, `maxVoltageKv`, `voltageClass` (extra-high/high/medium/low/unknown), `ownerName`, `ownerUtilityId`, `source` (osm/eia/hybrid), `sourceUrl`, `osmId`, `eiaId`, `hifldLegacyId`, `balancingAuthorityId`, `isoId`, `createdAt`, `updatedAt`, `deletedAt` (soft-delete), `version` |
| **Source** | Primary: OpenStreetMap `power=substation` via Overpass API (ODbL). Secondary: EIA `U.S. Electric Substations` dataset (public domain). Hybrid deduplication with confidence scoring. |
| **Format** | JSON (`data/substations.json` for metadata list, `data/substations.geojson` for FeatureCollection), PostgreSQL table with PostGIS geometry column |
| **Coverage** | All 50 US states + DC + territories |
| **Update Frequency** | Weekly (automated via cron: `/api/cron/sync-substations`) |
| **License** | Dual: ODbL (OSM-sourced rows require attribution via `source='osm'` + `sourceUrl`); Public domain (EIA-sourced rows). Both are carried in every record via `source` + `sourceUrl` fields. |
| **How We Get It** | `npm run sync:substations` script (can also be invoked via cron endpoint) fetches OSM Overpass data (state-by-state to avoid timeouts), merges with EIA public layer (when available), deduplicates via spatial grid (0.01° cells, 250 m tolerance), resolves utility ownership via fuzzy name match, and populates join tables (`transmission_line_endpoints`, `power_plant_interconnections`) to connect substations to existing entities. HIFLD legacy name reconciliation emitted to `data/substations-hifld-mismatches.csv` for community review. |
| **API Endpoints** | `GET /api/v1/substations?state=CA&limit=20` (list with filtering/sorting/pagination); `GET /api/v1/substations/[slug]` (detail); `GET /api/v1/substations/[slug]/transmission-lines` (connected transmission lines); `/api/tiles/substations/{z}/{x}/{y}.mvt` (vector tile for map rendering) |
| **UI Pages** | `/substations` (list with map, filters, search); `/substations/[slug]` (detail page with ownership, voltage, connected assets) |
| **Join Tables** | `transmission_line_endpoints` (links transmission lines to substation endpoints with match confidence); `power_plant_interconnections` (nearest substation per power plant with distance in meters) |
| **Related Entities** | transmission_lines (via `transmission_line_endpoints`), power_plants (via `power_plant_interconnections`), utilities (via `ownerUtilityId`), balancing_authorities, isos, pricing_nodes (via same substation location) |

---

## Integration Notes

1. **ODbL Attribution**: Every row with `source='osm'` must include attribution to OpenStreetMap contributors. The API and UI pages include a data footer: "Substation data sourced from [OpenStreetMap](https://www.openstreetmap.org/) ([ODbL](https://opendatacommons.org/licenses/odbl/1-0/)) and [EIA](https://www.eia.gov/)."

2. **Quality & Confidence**: The `transmission_line_endpoints.match_confidence` field (0..1) indicates fuzzy match quality for the transmission line connections. Low-confidence matches (< 0.75) are flagged for community review via the contributions workflow.

3. **Voltage Filtering**: List views default to `voltageClass IN ('transmission','extra-high','high')` to focus on bulk-power-relevant substations. The `minVoltageKv` and `maxVoltageKv` fields allow filtering to any voltage tier.

4. **Sync Cadence**: Weekly automatic sync via Vercel Cron (`/api/cron/sync-substations`) to keep OSM data fresh. EIA data updates annually or when new snapshots are published.

5. **Soft Deletes**: Substations follow CommonGrid's soft-delete pattern (`deletedAt` timestamp). Historical records remain queryable for audit trails.

---

## Example Queries

```typescript
// Fetch a substation by slug
GET /api/v1/substations/cove-station-ca

// List all high-voltage substations in PJM
GET /api/v1/substations?voltageClass=extra-high&isoId=pjm&limit=50

// Find transmission lines connected to a substation
GET /api/v1/substations/cove-station-ca/transmission-lines

// Find the nearest substation to a power plant
GET /api/v1/power-plants/diablo-canyon-1/substations

// Map tiles (for web map rendering)
GET /api/tiles/substations/10/262/409.mvt
```

---

## Historical Context

Substations became CommonGrid's 9th entry point in May 2026 following comprehensive evaluation of 14 candidates. Substations were selected as the highest-leverage addition because they:

- **Unlock topology**: Convert our loose entity graph into a routable network (transmission lines can now be traversed end-to-end).
- **Link three key entities**: Transmission lines (via `sub1`/`sub2`), power plants (via nearest interconnection), and pricing nodes (many LMP nodes are co-located at substation buses).
- **Serve the ecosystem**: Developers, journalists, grid planners, and researchers lack a single, consolidated, open-source substation registry post-HIFLD securitization.
- **Enable future work**: Queues (interconnection queue projects often reference `poi_substation`), DER siting tools, and outage analysis all depend on a clean substation layer.

---

*Substations rollout completed May 2026. See: memory/specs/ninth-entry-point-research.md*
