import { EDIT_SUMMARY_MIN_LENGTH } from "@/lib/mod/apply-contribution";

/**
 * Pure helpers behind the "Suggest Edit" flow.
 *
 * These live outside the React components so the two things that actually
 * decide whether a contribution is valid — which fields changed, and whether
 * the contributor explained why — are unit-testable without a DOM.
 */

/** Convert a snake_case field name to camelCase (`customer_count` -> `customerCount`). */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Look up a field's current value on an entity payload.
 *
 * The editable-fields API returns snake_case field names while entity payloads
 * are camelCase, so both spellings have to be tried or every field looks
 * "changed" on first render.
 */
export function lookupEntityValue(currentValues: Record<string, unknown>, fieldName: string): unknown {
  return currentValues[fieldName] ?? currentValues[snakeToCamel(fieldName)];
}

/** Treat `undefined` and `""` alike so a pristine-empty field is not a change. */
function normalize(value: unknown): unknown {
  return value === undefined || value === "" ? null : value;
}

/**
 * Diff the form state against the entity's current values.
 *
 * Values are compared after normalizing empty/undefined to null, and arrays
 * (multi_enum fields such as `asset_types`) are compared by content so that
 * re-rendering a checkbox group does not fabricate a change.
 */
export function computeChangedFields(
  formValues: Record<string, unknown>,
  currentValues: Record<string, unknown>
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(formValues)) {
    const current = normalize(lookupEntityValue(currentValues, key));
    const next = normalize(value);

    if (Array.isArray(current) && Array.isArray(next)) {
      const sameLength = current.length === next.length;
      if (sameLength && current.every((item, index) => item === next[index])) continue;
      changes[key] = value;
      continue;
    }

    if (next !== current) {
      changes[key] = value;
    }
  }

  return changes;
}

/** Whether the edit summary clears the minimum-length bar. */
export function isEditSummaryValid(editSummary: string, minLength: number = EDIT_SUMMARY_MIN_LENGTH): boolean {
  return editSummary.trim().length >= minLength;
}

export interface SourceCitation {
  sourceType: string;
  sourceUrl: string;
  sourceDate: string;
}

export interface ContributionDraft {
  entityType: string;
  entityId: string;
  entityVersion: number;
  changes: Record<string, unknown>;
  editSummary: string;
  citation: SourceCitation;
}

export interface ContributionPayload {
  entity_type: string;
  entity_id: string;
  entity_version: number;
  changes: Record<string, unknown>;
  edit_summary: string;
  source_type: string;
  source_url: string | null;
  source_date: string | null;
}

/** Build the POST body for `/api/v1/contributions` from drawer + confirm-step state. */
export function buildContributionPayload(draft: ContributionDraft): ContributionPayload {
  return {
    entity_type: draft.entityType,
    entity_id: draft.entityId,
    entity_version: draft.entityVersion,
    changes: draft.changes,
    edit_summary: draft.editSummary.trim(),
    source_type: draft.citation.sourceType,
    source_url: draft.citation.sourceUrl.trim() || null,
    source_date: draft.citation.sourceDate.trim() || null,
  };
}

/**
 * Gate for advancing from the edit drawer to the confirm step: there has to be
 * something to submit, but the summary is collected in the confirm step itself.
 */
export function canContinueToConfirm(changes: Record<string, unknown>): boolean {
  return Object.keys(changes).length > 0;
}

/** Final submit gate: real changes plus an adequate edit summary. */
export function canSubmitContribution(
  changes: Record<string, unknown>,
  editSummary: string,
  minLength: number = EDIT_SUMMARY_MIN_LENGTH
): boolean {
  return canContinueToConfirm(changes) && isEditSummaryValid(editSummary, minLength);
}
