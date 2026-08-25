"use client";

import { Dialog, Icon } from "@texturehq/edges";
import { EDIT_SUMMARY_MIN_LENGTH } from "@/lib/mod/apply-contribution";
import { EditSummaryField, SourceCitationFields } from "./EntityFormFields";

export interface ChangeSummaryItem {
  fieldName: string;
  displayName: string;
}

interface SubmitEditConfirmDialogProps {
  isOpen: boolean;
  entityName: string;
  /** The fields the contributor changed, for a last-look review. */
  changes: ChangeSummaryItem[];
  editSummary: string;
  onEditSummaryChange: (value: string) => void;
  sourceType: string;
  sourceUrl: string;
  sourceDate: string;
  onSourceTypeChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onSourceDateChange: (value: string) => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  /** Go back to the edit drawer without discarding the pending changes. */
  onBack: () => void;
  onSubmit: () => void;
}

/**
 * SubmitEditConfirmDialog
 *
 * Step 2 of the Suggest Edit flow. The drawer collects *what* changed; this
 * dialog collects *why* — the required edit summary plus an optional source
 * citation — immediately after the contributor commits to submitting.
 *
 * Asking here rather than inline at the bottom of the drawer means the
 * citation is a deliberate gate instead of a field people scroll past and
 * only discover when the submit button refuses to light up.
 */
export function SubmitEditConfirmDialog({
  isOpen,
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
  canSubmit,
  isSubmitting,
  submitError,
  onBack,
  onSubmit,
}: SubmitEditConfirmDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onBack}
      title="Describe your edit"
      hasBackArrow
      onBack={onBack}
      secondaryAction={{ label: "Back", onPress: onBack, isDisabled: isSubmitting }}
      primaryAction={{
        label: "Submit Edit",
        onPress: onSubmit,
        isDisabled: !canSubmit || isSubmitting,
        isLoading: isSubmitting,
      }}
    >
      <div className="space-y-4">
        {/* What is being submitted */}
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
          Edits are reviewed by moderators before they appear on CommonGrid. A citation makes review faster and keeps
          the dataset auditable.
        </p>
      </div>
    </Dialog>
  );
}
