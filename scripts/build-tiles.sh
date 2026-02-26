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
  --name="OpenGrid Territories" \
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
  --name="OpenGrid Power Plants" \
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
    --name="OpenGrid Transmission Lines" \
    --layer=transmission-lines \
    --minimum-zoom=0 \
    --maximum-zoom=12 \
    --simplify-only-low-zooms \
    --drop-smallest-as-needed \
    --extend-zooms-if-still-dropping \
    "$ROOT_DIR/.tmp-transmission-lines.geojson"

  echo ""
  echo "=== Step 7: Cleanup temp files ==="
  rm -f "$ROOT_DIR/.tmp-territories.geojson" "$ROOT_DIR/.tmp-power-plants.geojson" "$ROOT_DIR/.tmp-transmission-lines.geojson"
else
  echo "⚠️  No transmission line GeoJSON found — skipping tile generation."
  echo ""
  echo "=== Step 7: Cleanup temp files ==="
  rm -f "$ROOT_DIR/.tmp-territories.geojson" "$ROOT_DIR/.tmp-power-plants.geojson"
fi

echo ""
echo "=== Results ==="
pmtiles show "$OUT_DIR/territories.pmtiles"
echo ""
pmtiles show "$OUT_DIR/power-plants.pmtiles"
echo ""
if [ -f "$OUT_DIR/transmission-lines.pmtiles" ]; then
  pmtiles show "$OUT_DIR/transmission-lines.pmtiles"
  echo ""
fi
ls -lh "$OUT_DIR"/*.pmtiles
echo ""
echo "✅ Tile generation complete!"
