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
  
  # Create Linear issue for sync work (with dedup guard)
  LINEAR_KEY=$(HOME=/var/tmp/op-agent op read 'op://Fleet Secrets/Linear API Key - Texture/password' 2>/dev/null || echo "")
  
  if [[ -n "$LINEAR_KEY" ]]; then
    ISSUE_TITLE="Sync EIA-860M $REMOTE_MONTH"
    
    # Dedup guard: check for existing open issues with same title
    EXISTING_ISSUE=$(curl -sS -X POST 'https://api.linear.app/graphql' \
      -H "Authorization: $LINEAR_KEY" \
      -H 'Content-Type: application/json' \
      -d '{"query":"query { issues(filter: { title: { contains: \"'"$ISSUE_TITLE"'\" }, state: { type: { in: [\"backlog\", \"triage\", \"unstarted\", \"started\"] } } }) { nodes { identifier state { name } } } }"}' \
      | jq -r '.data.issues.nodes[0].identifier // "NONE"')
    
    if [[ "$EXISTING_ISSUE" != "NONE" ]]; then
      echo "LINEAR_ISSUE_EXISTS: $EXISTING_ISSUE (skipping duplicate creation)"
    else
      # Get ALL team ID
      TEAM_ID=$(curl -sS -X POST 'https://api.linear.app/graphql' \
        -H "Authorization: $LINEAR_KEY" \
        -H 'Content-Type: application/json' \
        -d '{"query":"query { teams(filter: { key: { eq: \"ALL\" } }) { nodes { id } } }"}' \
        | jq -r '.data.teams.nodes[0].id')
      
      if [[ -n "$TEAM_ID" && "$TEAM_ID" != "null" ]]; then
        # Create the issue
        ISSUE_DESCRIPTION="EIA-860M data staleness detected.\\n\\nRemote version: **$REMOTE_MONTH**\\nLocal version: **$LOCAL_MONTH**\\n\\nDetected by: \`scripts/heartbeat/eia-860m-freshness.sh\` at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        
        CREATED_ISSUE=$(curl -sS -X POST 'https://api.linear.app/graphql' \
          -H "Authorization: $LINEAR_KEY" \
          -H 'Content-Type: application/json' \
          -d '{"query":"mutation { issueCreate(input: { teamId: \"'"$TEAM_ID"'\", title: \"'"$ISSUE_TITLE"'\", description: \"'"$ISSUE_DESCRIPTION"'\" }) { success issue { identifier url } } }"}' \
          | jq -r '.data.issueCreate.issue.identifier // "FAILED"')
        
        if [[ "$CREATED_ISSUE" != "FAILED" ]]; then
          echo "LINEAR_ISSUE_CREATED: $CREATED_ISSUE"
        else
          echo "ERROR: Failed to create Linear issue" >&2
        fi
      else
        echo "ERROR: Failed to get ALL team ID" >&2
      fi
    fi
  else
    echo "WARNING: Linear API key not available (issue creation skipped)" >&2
  fi
  
  exit 1
elif [[ "$REMOTE_MONTH" == "$LOCAL_MONTH" ]]; then
  echo "UP_TO_DATE: $LOCAL_MONTH"
  exit 0
else
  # Remote is older than local (unusual but possible during local development)
  echo "LOCAL_AHEAD: Remote=$REMOTE_MONTH Local=$LOCAL_MONTH"
  exit 0
fi
