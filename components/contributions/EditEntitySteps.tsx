"use client";

/**
 * The body of each Suggest Edit step, without any surrounding chrome.
 *
 * The drawer wraps these in a Drawer; the Explore panel slides them in over the
 * entity view. Keeping the bodies here means the two surfaces show the same
 * thing and only the chrome differs.
 */

import { Icon, Loader } from "@texturehq/edges";
import { EDIT_SUMMARY_MIN_LENGTH } from "@/lib/mod/apply-contribution";
import { type EditableField, EditSummaryField, EntityFormFields, SourceCitationFields } from "./EntityFormFields";
import type { ChangeSummaryItem } from "./SubmitEditConfirmDialog";

export function EditFieldsStep({
  entityType,
  fields,
  formValues,
  isLoadingFields,
  fieldsError,
  onFieldChange,
  changeSummary,
  hasChanges,
  submitError,
}: {
  entityType: string;
  fields: EditableField[];
  formValues: Record<string, unknown>;
  isLoadingFields: boolean;
  fieldsError: string | null;
  onFieldChange: (fieldName: string, value: unknown) => void;
  changeSummary: ChangeSummaryItem[];
  hasChanges: boolean;
  submitError: string | null;
}) {
  if (isLoadingFields) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader size={32} />
      </div>
    );
  }

  if (fieldsError) {
    return (
      <div className="rounded-lg border border-feedback-error bg-feedback-error/10 p-3 text-sm text-feedback-error">
        <p className="font-medium">Error loading fields</p>
        <p className="mt-1">{fieldsError}</p>
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-border-default bg-background-muted p-3 text-sm">
        <p className="font-medium text-text-heading">No editable fields</p>
        <p className="mt-1 text-text-muted">This entity type has no editable fields configured.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EntityFormFields fields={fields} formValues={formValues} onChange={onFieldChange} mode="edit" />

      {entityType === "utility" && (
        <div className="rounded-md border border-border-default bg-background-muted p-3">
          <h4 className="mb-1 text-sm font-medium text-text-body">Service Territory</h4>
          <p className="text-xs text-text-muted">
            Service territory boundary editing is not available via the website. Territory boundaries are maintained
            from authoritative geospatial sources. Contact us for corrections.
          </p>
        </div>
      )}

      {hasChanges && (
        <div className="space-y-2 rounded-md bg-background-muted p-3">
          <h4 className="text-sm font-semibold text-text-heading">Changes ({changeSummary.length})</h4>
          <ul className="space-y-1 text-xs text-text-muted">
            {changeSummary.map((change) => (
              <li key={change.fieldName}>• {change.displayName}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Shown here too, for a contributor who stepped back from the review pane. */}
      {submitError && (
        <div className="rounded-lg border border-feedback-error bg-feedback-error/10 p-3 text-sm text-feedback-error">
          <p className="font-medium">Submission failed</p>
          <p className="mt-1">{submitError}</p>
        </div>
      )}
    </div>
  );
}

export function EditConfirmStep({
  entityName,
  changes,
  editSummary,
  onEditSummaryChange,
  sourceType,
  sourceUrl,
  sourceDate,
  onSourceTypeChange,
  onSourceUrlChange,
  onSourceDateChange,
  submitError,
}: {
  entityName: string;
  changes: ChangeSummaryItem[];
  editSummary: string;
  onEditSummaryChange: (value: string) => void;
  sourceType: string;
  sourceUrl: string;
  sourceDate: string;
  onSourceTypeChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onSourceDateChange: (value: string) => void;
  submitError: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border-default bg-background-muted p-3">
        <div className="text-sm font-medium text-text-heading">{entityName}</div>
        <div className="mt-1 text-xs text-text-muted">
          {changes.length === 1 ? "1 field changed" : `${changes.length} fields changed`}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
          {changes.map((change) => (
            <li key={change.fieldName}>• {change.displayName}</li>
          ))}
        </ul>
      </div>

      <EditSummaryField
        value={editSummary}
        onChange={onEditSummaryChange}
        minLength={EDIT_SUMMARY_MIN_LENGTH}
        placeholder={`Why are you making this change? (minimum ${EDIT_SUMMARY_MIN_LENGTH} characters)`}
      />

      <SourceCitationFields
        sourceType={sourceType}
        sourceUrl={sourceUrl}
        sourceDate={sourceDate}
        onSourceTypeChange={onSourceTypeChange}
        onSourceUrlChange={onSourceUrlChange}
        onSourceDateChange={onSourceDateChange}
      />

      {submitError && (
        <div className="rounded-lg border border-feedback-error bg-feedback-error/10 p-3 text-sm text-feedback-error">
          <div className="flex items-start gap-2">
            <Icon name="Warning" size={16} className="mt-0.5" />
            <div>
              <p className="font-medium">Submission failed</p>
              <p className="mt-1">{submitError}</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Edits are reviewed by moderators before they appear on CommonGrid. A citation makes review faster and keeps the
        dataset auditable.
      </p>
    </div>
  );
}
