/**
 * What someone at a utility can confirm, and whether past confirmations still
 * apply. Pure functions; the database side lives in ./store.ts.
 *
 * Confirmable: the utility's website, a distribution co-op's power supplier,
 * and the status of each program the utility runs. These are the things a
 * utility knows first-hand; EIA figures are already cited to EIA.
 */

export type ConfirmEntityType = "utility" | "program";
export type ConfirmFieldName = "website" | "generationProviderId" | "status";

/** Where "Something's wrong" sends the person for this row. */
export type Handoff = { kind: "suggest_edit" } | { kind: "program_page"; programSlug: string } | { kind: "discussion" };

export interface ConfirmRow {
  /** Stable key, `${entityType}:${entityId}:${fieldName}`. */
  key: string;
  entityType: ConfirmEntityType;
  entityId: string;
  fieldName: ConfirmFieldName;
  /** What the row is about, e.g. "Website", "Power supplier", or a program name. */
  label: string;
  /** The stored value, compared on confirm. Null when missing. */
  value: string | null;
  /** The value as shown, e.g. the supplier's name rather than its id. */
  displayValue: string | null;
  /** When someone at the utility last confirmed the current value, or null. */
  lastConfirmedAt: string | null;
  handoff: Handoff;
}

export interface RecordInput {
  utility: {
    id: string;
    name: string;
    shortName: string | null;
    segment: string | null;
    website: string | null;
    generationProviderId: string | null;
  };
  supplier: { id: string; name: string } | null;
  programs: { id: string; slug: string; name: string; status: string }[];
  /** Past confirmations for this utility, any order. */
  confirmations: {
    entityType: string;
    entityId: string;
    fieldName: string;
    confirmedValue: unknown;
    createdAt: Date;
  }[];
}

export function rowKey(entityType: string, entityId: string, fieldName: string): string {
  return `${entityType}:${entityId}:${fieldName}`;
}

function blankToNull(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * "http://www.4county.org/" -> "www.4county.org", "https://x.org/outages" -> "x.org/outages".
 * Drops only the scheme and a trailing slash, so any path stays visible: the
 * whole stored URL is what gets confirmed.
 */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** "ACTIVE" -> "Active", "COMING_SOON" -> "Coming soon". */
export function statusLabel(status: string): string {
  const s = status.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The name confirmations are shown under: the short name if there is one. */
export function confirmerName(utility: { name: string; shortName: string | null }): string {
  return blankToNull(utility.shortName) ?? utility.name;
}

export function isCooperative(segment: string | null): boolean {
  return segment === "DISTRIBUTION_COOPERATIVE";
}

/** The rows to show, in order: website, power supplier (co-ops only), then programs by name. */
export function buildRows(input: RecordInput): ConfirmRow[] {
  const { utility, supplier, programs, confirmations } = input;

  const latest = new Map<string, Date>();
  const rows: Omit<ConfirmRow, "lastConfirmedAt">[] = [];

  const website = blankToNull(utility.website);
  rows.push({
    key: rowKey("utility", utility.id, "website"),
    entityType: "utility",
    entityId: utility.id,
    fieldName: "website",
    label: "Website",
    value: website,
    displayValue: website ? displayUrl(website) : null,
    handoff: { kind: "suggest_edit" },
  });

  if (isCooperative(utility.segment)) {
    const supplierId = blankToNull(utility.generationProviderId);
    rows.push({
      key: rowKey("utility", utility.id, "generationProviderId"),
      entityType: "utility",
      entityId: utility.id,
      fieldName: "generationProviderId",
      label: "Power supplier",
      value: supplierId,
      displayValue: supplierId ? (supplier?.name ?? null) : null,
      handoff: { kind: "discussion" },
    });
  }

  for (const p of [...programs].sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push({
      key: rowKey("program", p.id, "status"),
      entityType: "program",
      entityId: p.id,
      fieldName: "status",
      label: p.name,
      value: blankToNull(p.status),
      displayValue: blankToNull(p.status) ? statusLabel(p.status) : null,
      handoff: { kind: "program_page", programSlug: p.slug },
    });
  }

  // A confirmation applies only while the field still holds the value confirmed.
  const current = new Map(rows.map((r) => [r.key, r.value]));
  for (const c of confirmations) {
    const key = rowKey(c.entityType, c.entityId, c.fieldName);
    const value = current.get(key);
    if (value === undefined || value === null || !sameValue(c.confirmedValue, value)) continue;
    const prev = latest.get(key);
    if (!prev || c.createdAt > prev) latest.set(key, c.createdAt);
  }

  return rows.map((r) => ({ ...r, lastConfirmedAt: latest.get(r.key)?.toISOString() ?? null }));
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ---------------------------------------------------------------------------
// Public display
// ---------------------------------------------------------------------------

/**
 * A confirmation as shown on public pages: one field, the value that was
 * confirmed, and when. Never who: no user id, name, email or email domain.
 */
export interface PublicConfirmation {
  entityType: ConfirmEntityType;
  entityId: string;
  fieldName: ConfirmFieldName;
  /** The value confirmed. The line is only shown beside this exact value. */
  value: string;
  confirmedAt: string;
  /** For a program's status: the program's slug. */
  programSlug?: string;
}

/** The rows whose current value has been confirmed. Unconfirmed and changed fields are left out. */
export function publicConfirmations(rows: ConfirmRow[]): PublicConfirmation[] {
  const out: PublicConfirmation[] = [];
  for (const r of rows) {
    if (r.value === null || r.lastConfirmedAt === null) continue;
    out.push({
      entityType: r.entityType,
      entityId: r.entityId,
      fieldName: r.fieldName,
      value: r.value,
      confirmedAt: r.lastConfirmedAt,
      ...(r.handoff.kind === "program_page" ? { programSlug: r.handoff.programSlug } : {}),
    });
  }
  return out;
}

/**
 * The confirmation for one field, but only if `shownValue` (what the page is
 * displaying) is still the value that was confirmed. Guards against a cached
 * confirmation sitting beside a value that has since changed.
 */
export function confirmationFor(
  confirmations: PublicConfirmation[],
  field: { fieldName: "website" | "generationProviderId" } | { fieldName: "status"; programSlug: string },
  shownValue: string | null | undefined
): PublicConfirmation | null {
  const shown = blankToNull(shownValue);
  if (shown === null) return null;
  const match = confirmations.find((c) =>
    field.fieldName === "status"
      ? c.entityType === "program" && c.fieldName === "status" && c.programSlug === field.programSlug
      : c.entityType === "utility" && c.fieldName === field.fieldName
  );
  return match && sameValue(match.value, shown) ? match : null;
}

function formatConfirmedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * "Confirmed by 4-County Electric staff · Nov 10, 2026". "staff" because the
 * email check shows someone works there, not that the utility said it
 * officially. Use scope "status" where the line isn't directly under its
 * field, so it can't read as covering a whole program.
 */
export function confirmedLine(name: string, iso: string, scope?: "status"): string {
  return `${scope === "status" ? "Status confirmed" : "Confirmed"} by ${name} staff · ${formatConfirmedDate(iso)}`;
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

export interface ConfirmRequestField {
  entityType: ConfirmEntityType;
  entityId: string;
  fieldName: ConfirmFieldName;
  /** The value the person saw. Must still be the stored value. */
  value: string;
}

const MAX_FIELDS = 50;
const ENTITY_TYPES = new Set(["utility", "program"]);
const FIELD_NAMES = new Set(["website", "generationProviderId", "status"]);

export function parseConfirmRequest(
  body: unknown
): { ok: true; fields: ConfirmRequestField[] } | { ok: false; error: string } {
  const fields = (body as { fields?: unknown } | null)?.fields;
  if (!Array.isArray(fields) || fields.length === 0) return { ok: false, error: "fields must be a non-empty list." };
  if (fields.length > MAX_FIELDS) return { ok: false, error: `At most ${MAX_FIELDS} fields at a time.` };

  const out: ConfirmRequestField[] = [];
  const seen = new Set<string>();
  for (const f of fields as Record<string, unknown>[]) {
    if (!f || typeof f !== "object") return { ok: false, error: "Each field must be an object." };
    const { entityType, entityId, fieldName, value } = f;
    if (typeof entityType !== "string" || !ENTITY_TYPES.has(entityType)) {
      return { ok: false, error: 'entityType must be "utility" or "program".' };
    }
    if (typeof entityId !== "string" || !entityId) return { ok: false, error: "entityId is required." };
    if (typeof fieldName !== "string" || !FIELD_NAMES.has(fieldName)) {
      return { ok: false, error: "fieldName must be website, generationProviderId or status." };
    }
    if (typeof value !== "string" || !value.trim())
      return { ok: false, error: "Only fields with a value can be confirmed." };
    const key = rowKey(entityType, entityId, fieldName);
    if (seen.has(key)) return { ok: false, error: "Each field can only be confirmed once per request." };
    seen.add(key);
    out.push({
      entityType: entityType as ConfirmEntityType,
      entityId,
      fieldName: fieldName as ConfirmFieldName,
      value,
    });
  }
  return { ok: true, fields: out };
}

/**
 * Check requested fields against the current rows. Unknown fields are ones
 * this utility can't confirm; stale ones changed since the person loaded them.
 */
export function checkAgainstRows(
  fields: ConfirmRequestField[],
  rows: ConfirmRow[]
): { ok: true; rows: ConfirmRow[] } | { ok: false; unknown: string[]; stale: string[] } {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const unknown: string[] = [];
  const stale: string[] = [];
  const matched: ConfirmRow[] = [];
  for (const f of fields) {
    const key = rowKey(f.entityType, f.entityId, f.fieldName);
    const row = byKey.get(key);
    if (!row) unknown.push(key);
    else if (row.value === null || !sameValue(row.value, f.value)) stale.push(key);
    else matched.push(row);
  }
  return unknown.length || stale.length ? { ok: false, unknown, stale } : { ok: true, rows: matched };
}
