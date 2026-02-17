# ⚡ Open Grid

The open-source energy infrastructure dataset — built by [Texture](https://texturehq.com), maintained by the community.

## What is Open Grid?

If you work in energy, you know the pain: utility service territories buried in PDFs, rate structures scattered across state PUC filings, grid operator boundaries that nobody agrees on, manufacturer specs locked behind vendor portals.

Open Grid is the cleaned, normalized, and structured version of all that publicly available data — utility territories, grid infrastructure, rate schedules, device ecosystems — made freely available so nobody has to reinvent this wheel.

## What's included

- **Utility Territories** — Service territory boundaries for IOUs, co-ops, and munis
- **Grid Infrastructure** — ISO/RTO regions, balancing authorities, substations, generation assets
- **Rate Structures** — Tariff data, rate schedules, and program details from state filings
- **Device Ecosystems** — Manufacturer specs and device catalogs for batteries, inverters, thermostats, EVs

## Data Sources

Seeded from authoritative public sources:

- [EIA-861](https://www.eia.gov/electricity/data/eia861/) — Electric utility data
- [HIFLD](https://hifld-geoplatform.opendata.arcgis.com/) — Homeland infrastructure geospatial data
- [NOAA](https://www.noaa.gov/) — Climate and weather data
- FERC filings and state PUC records
- Manufacturer spec sheets and documentation

## Contributing

Open Grid follows the [OpenStreetMap](https://www.openstreetmap.org/) contribution model:

1. **Browse & Flag** — No account needed. Explore data and flag issues.
2. **Edit** — Registered contributors edit directly. Schema-validated, auto-published.
3. **Claim & Verify** — Organizations claim their entries with a verified badge.

## Development

```bash
npm install
npm run dev
# Visit http://localhost:3000
```

## Status

🚧 **Early Access** — We're seeding the initial dataset and building the explorer interface. Star the repo and watch for updates.

## License

[TBD]

---

Built by [Texture](https://texturehq.com) — the energy operating system.
