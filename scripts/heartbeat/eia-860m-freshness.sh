#!/usr/bin/env bash
# EIA-860M freshness check — canonical implementation
# Compares the latest month available on EIA's website against the local manifest.json
# Exit 0 = up to date, Exit 1 = newer data available, Exit 2 = check failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$REPO_ROOT/data/eia-860m/manifest.json"

# Check if manifest exists
if [[ ! -f "$MANIFEST" ]]; then
  echo "ERROR: manifest.json not found at $MANIFEST" >&2
  exit 2
fi

# Extract local latest month (format: YYYY-MM)
LOCAL_MONTH=$(jq -r '.latest_month' "$MANIFEST")
if [[ -z "$LOCAL_MONTH" || "$LOCAL_MONTH" == "null" ]]; then
  echo "ERROR: Could not read latest_month from manifest.json" >&2
  exit 2
fi

# Fetch EIA-860M release page
EIA_URL="https://www.eia.gov/electricity/data/eia860m/"
PAGE_HTML=$(curl -sS "$EIA_URL" || { echo "ERROR: Failed to fetch $EIA_URL" >&2; exit 2; })

# Extract the most recent month from the page
# The page lists files like "april_generator2026.xlsx" and has month labels
# We'll look for the pattern: monthname_generatorYYYY.xlsx and extract the most recent
# Example: "april_generator2026.xlsx" → 2026-04

# Extract all generator file names and convert to YYYY-MM format
REMOTE_MONTHS=$(echo "$PAGE_HTML" | \
  grep -oP '(?<=href=")[^"]*generator\d{4}\.xlsx' | \
  grep -oP '(january|february|march|april|may|june|july|august|september|october|november|december)_generator\d{4}' | \
  while read -r filename; do
    month_name=$(echo "$filename" | grep -oP '^[a-z]+')
    year=$(echo "$filename" | grep -oP '\d{4}')
    
    case "$month_name" in
      january)   month_num="01" ;;
      february)  month_num="02" ;;
      march)     month_num="03" ;;
      april)     month_num="04" ;;
      may)       month_num="05" ;;
      june)      month_num="06" ;;
      july)      month_num="07" ;;
      august)    month_num="08" ;;
      september) month_num="09" ;;
      october)   month_num="10" ;;
      november)  month_num="11" ;;
      december)  month_num="12" ;;
      *) continue ;;
    esac
    
    echo "$year-$month_num"
  done | sort -u)

if [[ -z "$REMOTE_MONTHS" ]]; then
  echo "ERROR: Could not extract any month data from EIA page" >&2
  exit 2
fi

# Get the most recent month
REMOTE_MONTH=$(echo "$REMOTE_MONTHS" | sort -r | head -n1)

# Compare
if [[ "$REMOTE_MONTH" > "$LOCAL_MONTH" ]]; then
  echo "NEW_DATA_AVAILABLE: Remote=$REMOTE_MONTH Local=$LOCAL_MONTH"
  exit 1
elif [[ "$REMOTE_MONTH" == "$LOCAL_MONTH" ]]; then
  echo "UP_TO_DATE: $LOCAL_MONTH"
  exit 0
else
  # Remote is older than local (unusual but possible during local development)
  echo "LOCAL_AHEAD: Remote=$REMOTE_MONTH Local=$LOCAL_MONTH"
  exit 0
fi
