"use client";

import { Dialog } from "@texturehq/edges";
import { useEffect, useState } from "react";
import { EDIT_SUMMARY_MIN_LENGTH } from "@/lib/mod/apply-contribution";
import { EditSummaryField, SourceCitationFields } from "./EntityFormFields";

interface SubmitConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSubmit: (editSummary: string, sourceType: string, sourceUrl: string, sourceDate: string) => Promise<void>;
  initialEditSummary: string;
  initialSourceType: string;
  initialSourceUrl: string;
  initialSourceDate: string;
  isSubmitting: boolean;
  submitError: string | null;
  hasChanges: boolean;
}

export function SubmitConfirmationDialog({
  isOpen,
  onClose,
  onConfirmSubmit,
  initialEditSummary,
  initialSourceType,
  initialSourceUrl,
  initialSourceDate,
  isSubmitting,
  submitError,
  hasChanges,
}: SubmitConfirmationDialogProps) {
  const [editSummary, setEditSummary] = useState(initialEditSummary);
  const [sourceType, setSourceType] = useState(initialSourceType);
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [sourceDate, setSourceDate] = useState(initialSourceDate);

  // Sync internal state with initial props when dialog opens or props change
  useEffect(() => {
    setEditSummary(initialEditSummary);
    setSourceType(initialSourceType);
    setSourceUrl(initialSourceUrl);
    setSourceDate(initialSourceDate);
  }, [initialEditSummary, initialSourceType, initialSourceUrl, initialSourceDate]);

  const summaryLongEnough = editSummary.trim().length >= EDIT_SUMMARY_MIN_LENGTH;
  const canConfirm = summaryLongEnough && hasChanges && !isSubmitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    await onConfirmSubmit(editSummary, sourceType, sourceUrl, sourceDate);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Your Changes"
      secondaryAction={{ label: "Cancel", onPress: onClose, isDisabled: isSubmitting }}
      primaryAction={{
        label: isSubmitting ? "Submitting..." : "Confirm & Submit",
        onPress: handleConfirm,
        variant: "primary",
        isDisabled: !canConfirm,
        isLoading: isSubmitting,
      }}
    >
      <div className="space-y-4">
        <p className="text-sm text-text-body">
          Please provide an edit summary and source citation for your proposed changes.
        </p>

        {/* Edit Summary */}
        <EditSummaryField value={editSummary} onChange={setEditSummary} minLength={EDIT_SUMMARY_MIN_LENGTH} />

        {/* Source Citation */}
        <SourceCitationFields
          sourceType={sourceType}
          sourceUrl={sourceUrl}
          sourceDate={sourceDate}
          onSourceTypeChange={setSourceType}
          onSourceUrlChange={setSourceUrl}
          onSourceDateChange={setSourceDate}
        />

        {/* Submit Error */}
        {submitError && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <p className="text-sm font-medium text-red-800">Submission failed</p>
            <p className="text-sm text-red-700 mt-1">{submitError}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
