#!/usr/bin/env bash
set -euo pipefail

# Build PMTiles from territory + power plant data using tippecanoe.
# Requires: tippecanoe, node

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$ROOT_DIR/public/tiles"

mkdir -p "$OUT_DIR"

echo "=== Step 1: Prepare territory GeoJSON ==="
node "$SCRIPT_DIR/prepare-territory-geojson.mjs"

echo ""
echo "=== Step 2: Prepare power plant GeoJSON ==="
node "$SCRIPT_DIR/prepare-power-plants-geojson.mjs"

echo ""
echo "=== Step 3: Generate territory tiles with tippecanoe ==="
tippecanoe \
  --output="$OUT_DIR/territories.pmtiles" \
  --force \
  --name="CommonGrid Territories" \
  --layer=territories \
  --minimum-zoom=0 \
  --maximum-zoom=12 \
  --simplification=10 \
  --simplify-only-low-zooms \
  --detect-shared-borders \
  --coalesce-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-tile-size-limit \
  "$ROOT_DIR/.tmp-territories.geojson"

echo ""
echo "=== Step 4: Generate power plant tiles with tippecanoe ==="
tippecanoe \
  --output="$OUT_DIR/power-plants.pmtiles" \
  --force \
  --name="CommonGrid Power Plants" \
  --layer=power-plants \
  --minimum-zoom=0 \
  --maximum-zoom=12 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  "$ROOT_DIR/.tmp-power-plants.geojson"

echo ""
echo "=== Step 5: Prepare transmission line GeoJSON ==="
node "$SCRIPT_DIR/prepare-transmission-lines-geojson.mjs"

echo ""
echo "=== Step 6: Generate transmission line tiles with tippecanoe ==="
if [ -f "$ROOT_DIR/.tmp-transmission-lines.geojson" ]; then
  tippecanoe \
    --output="$OUT_DIR/transmission-lines.pmtiles" \
    --force \
    --name="CommonGrid Transmission Lines" \
    --layer=transmission-lines \
    --minimum-zoom=0 \
    --maximum-zoom=12 \
    --simplify-only-low-zooms \
    --drop-smallest-as-needed \
    --extend-zooms-if-still-dropping \
    "$ROOT_DIR/.tmp-transmission-lines.geojson"
else
  echo "⚠️  No transmission line GeoJSON found — skipping tile generation."
fi

echo ""
echo "=== Step 7: Prepare EV charging GeoJSON ==="
if [ -f "$ROOT_DIR/data/ev-charging.json" ]; then
  node "$SCRIPT_DIR/prepare-ev-charging-geojson.mjs"
else
  echo "⚠️  No ev-charging.json found — skipping EV charging tile generation."
fi

echo ""
echo "=== Step 8: Generate EV charging tiles with tippecanoe ==="
if [ -f "$ROOT_DIR/.tmp-ev-charging.geojson" ]; then
  tippecanoe \
    --output="$OUT_DIR/ev-charging.pmtiles" \
    --force \
    --name="CommonGrid EV Charging" \
    --layer=ev-charging \
    --minimum-zoom=0 \
    --maximum-zoom=12 \
    --drop-densest-as-needed \
    --extend-zooms-if-still-dropping \
    "$ROOT_DIR/.tmp-ev-charging.geojson"
else
  echo "⚠️  No EV charging GeoJSON found — skipping tile generation."
fi

echo ""
echo "=== Step 9: Prepare pricing nodes GeoJSON ==="
if [ -f "$ROOT_DIR/data/pricing-nodes.json" ]; then
  node "$SCRIPT_DIR/prepare-pricing-nodes-geojson.mjs"
else
  echo "⚠️  No pricing-nodes.json found — skipping pricing node tile generation."
fi

echo ""
echo "=== Step 10: Generate pricing node tiles with tippecanoe ==="
if [ -f "$ROOT_DIR/.tmp-pricing-nodes.geojson" ]; then
  tippecanoe \
    --output="$OUT_DIR/pricing-nodes.pmtiles" \
    --force \
    --name="CommonGrid Pricing Nodes" \
    --layer=pricing-nodes \
    --minimum-zoom=0 \
    --maximum-zoom=12 \
    --drop-densest-as-needed \
    --extend-zooms-if-still-dropping \
    "$ROOT_DIR/.tmp-pricing-nodes.geojson"
else
  echo "⚠️  No pricing node GeoJSON found — skipping tile generation."
fi

echo ""
echo "=== Step 11: Prepare substation GeoJSON ==="
node "$SCRIPT_DIR/prepare-substations-geojson.mjs"

echo ""
echo "=== Step 12: Generate substation tiles with tippecanoe ==="
if [ -f "$ROOT_DIR/.tmp-substations.geojson" ]; then
  tippecanoe \
    --output="$OUT_DIR/substations.pmtiles" \
    --force \
    --name="CommonGrid Substations" \
    --layer=substations \
    --minimum-zoom=0 \
    --maximum-zoom=12 \
    --drop-densest-as-needed \
    --extend-zooms-if-still-dropping \
    "$ROOT_DIR/.tmp-substations.geojson"
else
  echo "⚠️  No substation GeoJSON found — skipping tile generation."
fi

echo ""
echo "=== Step 13: Cleanup temp files ==="
rm -f "$ROOT_DIR/.tmp-territories.geojson" \
      "$ROOT_DIR/.tmp-power-plants.geojson" \
      "$ROOT_DIR/.tmp-transmission-lines.geojson" \
      "$ROOT_DIR/.tmp-ev-charging.geojson" \
      "$ROOT_DIR/.tmp-pricing-nodes.geojson" \
      "$ROOT_DIR/.tmp-substations.geojson"

echo ""
echo "=== Results ==="

# Required layers. Every workflow that runs this script commits these, so a
# missing archive here means the build silently produced nothing publishable.
for required in territories power-plants; do
  if [ ! -s "$OUT_DIR/$required.pmtiles" ]; then
    echo "❌ Expected tile archive $OUT_DIR/$required.pmtiles is missing or empty." >&2
    exit 1
  fi
done

# `pmtiles show` is diagnostic output only. The CLI is a separate binary from
# tippecanoe and most sync workflows never install it, so a bare call here used
# to abort the whole job with exit 127 *after* every tile had been built
# successfully — discarding the fresh tiles and turning the run red (CIR-1271).
# Summarise when the CLI exists, and fall back to a plain listing when it does not.
if command -v pmtiles >/dev/null 2>&1; then
  for layer in territories power-plants transmission-lines ev-charging pricing-nodes substations; do
    if [ -f "$OUT_DIR/$layer.pmtiles" ]; then
      pmtiles show "$OUT_DIR/$layer.pmtiles" || echo "⚠️  pmtiles show failed for $layer — continuing."
      echo ""
    fi
  done
else
  echo "ℹ️  pmtiles CLI not installed — skipping per-archive summaries."
  echo ""
fi

ls -lh "$OUT_DIR"/*.pmtiles
echo ""
echo "✅ Tile generation complete!"
