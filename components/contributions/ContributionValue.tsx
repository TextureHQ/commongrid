"use client";

import { Badge } from "@texturehq/edges";
import Link from "next/link";
import {
  AssetTypeLabel,
  GridServiceLabel,
  IncentiveStructureLabel,
  MarketSegmentLabel,
  ParticipationModelLabel,
  ProgramOrganizationRoleLabel,
  ProgramStatusLabel,
} from "@/types/programs";

// ---------------------------------------------------------------------------
// Humanization helpers
// ---------------------------------------------------------------------------

/**
 * Universal fallback: turn an enum-ish code (SNAKE_CASE or kebab-case) into
 * Title Case so a raw code like SMART_DEVICE never leaks into moderator UI.
 * e.g. "SMART_DEVICE" -> "Smart Device", "demand-response" -> "Demand Response".
 */
export function humanizeEnum(code: string): string {
  return code
    .trim()
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Per-field label maps for enum multi-select and enum scalar fields. */
const FIELD_LABEL_MAPS: Record<string, Record<string, string>> = {
  asset_types: AssetTypeLabel,
  grid_services: GridServiceLabel,
  market_segments: MarketSegmentLabel,
  participation_models: ParticipationModelLabel,
  incentive_structures: IncentiveStructureLabel,
  status: ProgramStatusLabel,
  // device_types intentionally omitted: no canonical label map — humanize generically.
};

/** Resolve a single enum value to a human label, falling back to humanizeEnum. */
function labelForEnum(field: string, code: string): string {
  const map = FIELD_LABEL_MAPS[field];
  return map?.[code] ?? humanizeEnum(code);
}

const ENUM_CODE_RE = /^[A-Z0-9]+(?:[_-][A-Z0-9]+)*$/;

/** True when a scalar string looks like a raw enum code (ALL_CAPS / SNAKE). */
function looksLikeEnumCode(value: string): boolean {
  return value.length > 1 && ENUM_CODE_RE.test(value);
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

interface OrgLike {
  entityId: string;
  role: string;
}

function isOrgLike(value: unknown): value is OrgLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "entityId" in value &&
    "role" in value &&
    typeof (value as Record<string, unknown>).entityId === "string" &&
    typeof (value as Record<string, unknown>).role === "string"
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function EmDash() {
  return <span className="text-text-muted">—</span>;
}

function EnumBadges({ field, values }: { field: string; values: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((code) => (
        <Badge key={code} size="sm" shape="pill" variant="neutral">
          {labelForEnum(field, code)}
        </Badge>
      ))}
    </div>
  );
}

function OrganizationList({ orgs }: { orgs: OrgLike[] }) {
  return (
    <ul className="space-y-1.5">
      {orgs.map((org) => (
        <li key={`${org.entityId}-${org.role}`} className="flex items-center gap-2">
          <span className="text-sm text-text-body break-words">{org.entityId}</span>
          <Badge size="sm" shape="pill" variant="info">
            {ProgramOrganizationRoleLabel[org.role as keyof typeof ProgramOrganizationRoleLabel] ??
              humanizeEnum(org.role)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Render a scalar (string humanization is caller-controlled). */
function ScalarValue({ field, value }: { field: string; value: string | number }) {
  if (typeof value === "number") return <span className="text-text-body">{String(value)}</span>;

  const str = value;
  if (str.trim() === "") return <EmDash />;

  if (isUrl(str)) {
    return (
      <Link
        href={str}
        target="_blank"
        rel="noreferrer"
        className="text-brand-primary underline break-words hover:opacity-80"
      >
        {str}
      </Link>
    );
  }

  // A bare enum code as a scalar (e.g. status) — humanize so no raw code shows.
  if (looksLikeEnumCode(str)) {
    return <span className="text-text-body break-words">{labelForEnum(field, str)}</span>;
  }

  return <span className="text-text-body break-words whitespace-pre-wrap">{str}</span>;
}

/** Render a nested leaf value inside a key/value list without raw JSON. */
function formatLeaf(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (Array.isArray(val)) {
    if (val.length === 0) return "—";
    return val.map((item) => formatLeaf(item)).join(", ");
  }
  if (typeof val === "object") {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${humanizeEnum(k)}: ${formatLeaf(v)}`)
      .join("; ");
  }
  if (typeof val === "string" && looksLikeEnumCode(val)) return humanizeEnum(val);
  return String(val);
}

/** Last-resort compact key/value list for unknown objects (never raw JSON). */
function KeyValueList({ record }: { record: Record<string, unknown> }) {
  const entries = Object.entries(record);
  if (entries.length === 0) return <EmDash />;
  return (
    <dl className="space-y-0.5">
      {entries.map(([key, val]) => (
        <div key={key} className="flex gap-1.5 text-sm">
          <dt className="font-medium text-text-muted">{humanizeEnum(key)}:</dt>
          <dd className="text-text-body break-words">{formatLeaf(val)}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function ContributionValue({ field, value }: { field: string; value: unknown }) {
  if (value === null || value === undefined) return <EmDash />;

  if (Array.isArray(value)) {
    if (value.length === 0) return <EmDash />;

    // Organizations: objects with entityId + role.
    if (value.every(isOrgLike)) {
      return <OrganizationList orgs={value} />;
    }

    // Enum multi-select: array of strings.
    if (value.every((v) => typeof v === "string")) {
      return <EnumBadges field={field} values={value as string[]} />;
    }

    // Generic array of objects/mixed — render each item as a key/value block.
    return (
      <div className="space-y-2">
        {value.map((item, i) =>
          isPlainObject(item) ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: read-only diff list, never reorders
            <KeyValueList key={i} record={item} />
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: read-only diff list, never reorders
            <div key={i} className="text-sm text-text-body break-words">
              {item === null || item === undefined ? "—" : String(item)}
            </div>
          )
        )}
      </div>
    );
  }

  if (typeof value === "boolean") {
    return <span className="text-text-body">{value ? "Yes" : "No"}</span>;
  }

  if (typeof value === "string" || typeof value === "number") {
    return <ScalarValue field={field} value={value} />;
  }

  if (isPlainObject(value)) {
    return <KeyValueList record={value} />;
  }

  // Truly unknown scalar coercion.
  return <span className="text-text-body break-words">{String(value)}</span>;
}
