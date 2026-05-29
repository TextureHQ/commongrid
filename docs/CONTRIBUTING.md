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

### 4. Improve the Site

The CommonGrid website (commongrid.info) is built with Next.js. The app lives in the repo root with the following structure:

- `app/` — Next.js App Router pages and layouts
- `components/` — React components
- `lib/` — Data loading and utility functions
- `types/` — TypeScript type definitions

## Running the Site Locally

```bash
npm install
npm run dev
# Open http://localhost:3000
```

**Environment variables (optional):**
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` — For Mapbox-powered maps. Without it, the home page shows a static landing view — all other pages work fine.

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
- **Biome** for linting and formatting (`npm run lint`)
- **Atomic commits** — one logical change per commit
- **Descriptive commit messages** — explain _what_ and _why_

### Styling Guidelines

CommonGrid uses a **Tailwind-first approach** for all styling. Please follow these guidelines:

#### ✅ DO:

- **Use Tailwind utility classes** for all styling whenever possible
- **Use Edges design system components** for interactive elements:
  - `Button` for buttons
  - `TextField` for form inputs
  - `Kpi`/`KpiGroup` for metrics
  - `StatList` for field/value lists
- **Build custom components** only for CommonGrid-specific patterns
- **Use inline styles** ONLY for:
  - CSS variable references (e.g., `style={{ color: "var(--color-text-muted)" }}`)
  - Truly dynamic values (e.g., `style={{ backgroundColor: color }}`)
  - Mapbox/map-specific positioning
  - Third-party library requirements

#### ❌ DON'T:

- **Do NOT create new CSS files** (except for special cases like homepage styles)
- **Do NOT use custom CSS classes** when Tailwind utilities exist
- **Do NOT add new global CSS** except in `app/globals.css`

#### Existing CSS Files

The following CSS files are intentionally kept:
- `app/globals.css` — Global styles and Tailwind imports
- `app/(shell)/homepage-minimal.css` — Homepage-specific styles
- Page-specific CSS for special layouts (about, explore, changelog)

All other styling should use Tailwind utilities or the Edges component library.

### Component Library

CommonGrid uses the [@texturehq/edges](https://github.com/TextureHQ/edges) design system:

- **Atoms**: Low-level interactive components (Button, TextField, Checkbox, etc.)
- **Composites**: Higher-level patterns (Kpi, KpiGroup, StatList, etc.)

See `components/ui/README.md` for a detailed component inventory and migration status.

## Pull Request Process

1. Ensure your changes don't break existing data schemas
2. If adding new fields, update the TypeScript types in `types/entities.ts`
3. Run `npm run lint` and `npm run build` to ensure your changes pass CI
4. Test the site locally if you've changed app code
5. Describe what changed and why in your PR description
6. Link to relevant issues if applicable

## Questions?

Open a [GitHub Discussion](https://github.com/TextureHQ/commongrid/discussions) or reach out to the Texture team.
