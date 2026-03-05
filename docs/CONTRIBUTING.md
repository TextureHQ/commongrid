# Contributing to CommonGrid

Thanks for your interest in contributing to CommonGrid! Whether you're fixing a typo in a utility name, adding missing territory boundaries, or improving the explorer app — every contribution helps make energy infrastructure data more accessible.

## Ways to Contribute

### 1. Report Data Issues

Found incorrect data? Open an issue with:
- Which file/entity is affected
- What's wrong (e.g., "Duke Energy customer count is outdated")
- The correct value with a source link if possible

### 2. Add or Update Data

All data lives in the `data/` directory as JSON files. To contribute:

1. Fork the repository
2. Create a branch: `git checkout -b fix/utility-name-correction`
3. Edit the relevant JSON file in `data/`
4. Commit with a descriptive message
5. Open a PR

**Data files:**
| File | Description |
|------|-------------|
| `data/utilities.json` | All US electric utilities |
| `data/isos.json` | Independent System Operators |
| `data/rtos.json` | Regional Transmission Organizations |
| `data/balancing-authorities.json` | Balancing authorities |
| `data/regions.json` | Geographic regions (service territories, ISOs, BAs) |
| `data/territories/*.json` | GeoJSON boundary files |

### 3. Add Territory Boundaries

Territory boundaries are individual GeoJSON files in `data/territories/`. Each file is named by its EIA ID (e.g., `803.json`) or a slug for non-EIA entities (e.g., `ba-caiso.json`, `cca-cleanpowersf.json`).

**GeoJSON format:**
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
      "coordinates": [...]
    }
  }]
}
```

### 4. Improve the Explorer App

The explorer app lives in `explorer/`. It's a Next.js app that visualizes the data.

## Running the Explorer Locally

```bash
cd explorer
npm install
npm run dev
# Open http://localhost:4445
```

The explorer reads data from the repo root's `data/` directory via symlinks. If symlinks don't work on your system, you can copy the `data/` directory into `explorer/data/` and `explorer/public/data/`.

**Environment variables (optional):**
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` — For Mapbox-powered maps. The app works without it using a default tile provider.

## Running Sync Scripts

The `scripts/` directory contains scripts that sync data from authoritative sources. These require API keys and are primarily used by maintainers.

```bash
# Install dependencies (from repo root or scripts directory)
npm install tsx

# Sync all data sources
npx tsx scripts/sync-all.ts

# Individual sync scripts
npx tsx scripts/sync-arcgis.ts      # Territory boundaries from ArcGIS/HIFLD
npx tsx scripts/sync-ba.ts          # Balancing authority data
npx tsx scripts/sync-cca.ts         # Community Choice Aggregator data
npx tsx scripts/sync-eia-fields.ts  # EIA-861 utility data
npx tsx scripts/sync-notion.ts      # Notion database sync
```

See `scripts/README.md` for detailed documentation on each script.

## Code Standards

- **TypeScript** for all new code
- **Biome** for linting and formatting (`npm run lint:fix` in the explorer)
- **Atomic commits** — one logical change per commit
- **Descriptive commit messages** — explain _what_ and _why_

## Pull Request Process

1. Ensure your changes don't break existing data schemas
2. If adding new fields, update the TypeScript types in `explorer/types/entities.ts`
3. Test the explorer app locally if you've changed app code
4. Describe what changed and why in your PR description
5. Link to relevant issues if applicable

## Questions?

Open a [GitHub Discussion](https://github.com/TextureHQ/commongrid/discussions) or reach out to the Texture team.
