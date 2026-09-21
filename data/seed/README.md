# CommonGrid Launch Seed: Marquee IOU Programs

This directory holds a one-shot, human-curated seed dataset of high-profile investor-owned-utility (IOU) demand-response / DER / VPP programs that were conspicuously absent from CommonGrid at T-48h before launch.

## Files

- `marquee-iou-programs.csv` — 16 program rows, one per program variant / administrator pair, with mapped utility slugs from `data/utilities.json`.
- `README.md` — this file.

## Provenance

- **Source:** `manual:launch-seed`
- **Method:** Manual research via Brave Search, program administrator websites, and vendor pages; entity resolution against `data/utilities.json`.
- **Confidence:** Each row was verified against a live program page or official utility source before inclusion. Fields that could not be confirmed are left blank.

## Intended use

This CSV is intended for a single, human-initiated `applySync` import with:

```text
initiatedBy: 'manual:launch-seed'
```

Because the source is `manual`, the resulting records are human-sourced and lock-protected under policy B. Automated sync adapters that run later (e.g., `sync:eia-861`) cannot silently overwrite human-locked fields; they should either match and enrich these records or surface differences as suggestions.

## CSV columns

Columns mirror `lib/db/schema/programs.ts` field names as closely as possible:

| Column | Notes |
|--------|-------|
| `name` | Program brand name, sometimes with state/administrator qualifier. |
| `administrator_utility_slug` | Canonical utility slug from `data/utilities.json`. The only multi-state programs are split by administrator so this column stays a single foreign key. |
| `administrator_eia_id` | EIA Utility ID from `data/utilities.json`. Blank where the chosen administrator record does not carry one. |
| `states` | Participating states (comma-separated, uppercase). |
| `asset_types` | `AssetType` enum values from `types/programs.ts` (comma-separated, quoted). |
| `device_types` | `DeviceType` enum values (comma-separated, quoted). |
| `market_segments` | `MarketSegment` enum values. |
| `grid_services` | `GridService` enum values. |
| `status` | `ProgramStatus` enum value. |
| `program_website` | Official program page used as the primary reference. |
| `derms_vendor` | DERMS / VPP platform operator, if discoverable. Xcel Renewable Battery Connect is powered by Texture, which is noted here. |
| `source_url` | The page or source used to confirm the row. |
| `notes` | Observations, caveats, and cross-administrator context. |

## Programs included

1. **Renewable Battery Connect** — Xcel Energy / Public Service Co. of Colorado (CO). Battery + solar DER VPP; powered by Texture.
2. **ConnectedSolutions** — National Grid MA, National Grid RI, National Grid Upstate NY; Eversource MA; Eversource CT. Battery and smart-thermostat demand response.
3. **Smart Usage Rewards** — Con Edison (NY) and Orange & Rockland (NY). Commercial / industrial demand response.
4. **Emergency Load Reduction Program** — PG&E (CA). Battery-discharge emergency VPP.
5. **Demand Response Programs** — SCE (CA). Residential smart-thermostat / HVAC / battery / EV programs.
6. **Bring Your Own Device (BYOD)** — Green Mountain Power (VT). Customer-owned battery VPP with many battery brands.
7. **PowerPair** — Duke Energy Carolinas (NC). Residential solar + battery pilot.
8. **EnergyWise Home** — Duke Energy (FL / Carolinas). Residential load-curtailment / switch program.
9. **Storage Rewards** — Arizona Public Service (AZ). Residential battery VPP pilot.
10. **Battery Partner** — Salt River Project (AZ). Residential battery peak-shaving program.
Not strictly an IOU but a major AZ utility with no existing CommonGrid coverage.
11. **Smart Battery Pilot** — Portland General Electric (OR). Residential battery VPP.

## Utility mapping notes

- All listed `administrator_utility_slug` values exist in `data/utilities.json`.
- Duke Energy `EnergyWise Home` uses the parent `duke-energy` slug because the program spans FL, NC, and SC; that parent record has no `eiaId`, so `administrator_eia_id` is blank for that row.
- Salt River Project is classified as `POLITICAL_SUBDIVISION` in `data/utilities.json`, not an IOU, but it is the other major Arizona administrator running a marquee battery program and was included to avoid an Arizona-shaped gap.

## Dropped or deferred programs

The following candidates were considered but not included because a current, well-defined program page could not be confidently identified in the available research time:

- **SDG&E "Power On"** — no active program page discovered; only generic battery/BESS and SGIP pages.
- **Dominion Energy (VA) residential battery / VPP** — only proposed utility-scale/storage pilots and regulatory filings found; no active customer DER program.
- **Georgia Power residential battery/VPP** — no confidently verified branded residential battery or thermostat DR program discovered; the "PowerPair" references found actually belong to Duke Energy or were third-party solar sales content.

These can be triaged post-launch via the Data Coverage Engine and EIA-861-driven sync.
