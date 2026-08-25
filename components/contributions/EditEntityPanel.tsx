"use client";

import { Button, Drawer, Icon, Loader } from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildContributionPayload,
  canContinueToConfirm,
  canSubmitContribution,
  computeChangedFields,
  isEditSummaryValid,
  lookupEntityValue,
} from "@/lib/contributions/edit-submission";
import { EDIT_SUMMARY_MIN_LENGTH } from "@/lib/mod/apply-contribution";
import { type EditableField, EntityFormFields } from "./EntityFormFields";
import { type ChangeSummaryItem, SubmitEditConfirmDialog } from "./SubmitEditConfirmDialog";

interface EditEntityPanelProps {
  entityType: string;
  entityId: string;
  entitySlug: string;
  entityName: string;
  currentValues: Record<string, unknown>;
  onClose: () => void;
  onSubmitted: () => void;
}

/** Which step of the two-step Suggest Edit flow is on screen. */
type EditStep = "fields" | "confirm";

export function EditEntityPanel({
  entityType,
  entityId,
  entitySlug: _entitySlug,
  entityName,
  currentValues,
  onClose,
  onSubmitted,
}: EditEntityPanelProps) {
  const router = useRouter();
  const [fields, setFields] = useState<EditableField[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(true);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  // Form state
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [sourceType, setSourceType] = useState("utility_website");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [editSummary, setEditSummary] = useState("");

  // Flow state: the citation + summary are collected in a confirm step that
  // opens after the contributor clicks through from the field drawer.
  const [step, setStep] = useState<EditStep>("fields");

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const lookupCurrentValue = useCallback(
    (fieldName: string): unknown => lookupEntityValue(currentValues, fieldName),
    [currentValues]
  );

  // Fetch editable fields on mount
  useEffect(() => {
    const fetchFields = async () => {
      try {
        setIsLoadingFields(true);
        setFieldsError(null);
        const res = await fetch(`/api/v1/editable-fields/${entityType}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch editable fields: ${res.statusText}`);
        }
        const json = await res.json();
        setFields(json.data ?? []);

        // Initialize form values with current values, looking up via both
        // snake_case and camelCase to handle API/payload mismatch.
        const initialValues: Record<string, unknown> = {};
        for (const field of json.data ?? []) {
          initialValues[field.fieldName] = lookupCurrentValue(field.fieldName);
        }
        setFormValues(initialValues);
      } catch (error) {
        console.error("Error fetching editable fields:", error);
        setFieldsError(error instanceof Error ? error.message : "Failed to load editable fields");
      } finally {
        setIsLoadingFields(false);
      }
    };

    fetchFields();
  }, [entityType, lookupCurrentValue]);

  const changedFields = useMemo(() => computeChangedFields(formValues, currentValues), [formValues, currentValues]);

  const changeSummary: ChangeSummaryItem[] = useMemo(
    () =>
      Object.keys(changedFields).map((fieldName) => ({
        fieldName,
        displayName: fields.find((f) => f.fieldName === fieldName)?.displayName ?? fieldName,
      })),
    [changedFields, fields]
  );

  const hasChanges = canContinueToConfirm(changedFields);
  const summaryLongEnough = isEditSummaryValid(editSummary, EDIT_SUMMARY_MIN_LENGTH);
  const canSubmit = canSubmitContribution(changedFields, editSummary, EDIT_SUMMARY_MIN_LENGTH);

  const handleFieldChange = (fieldName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  // Step 1 -> step 2. Nothing is sent yet; this only opens the confirm dialog.
  const handleContinue = () => {
    if (!hasChanges) return;
    setSubmitError(null);
    setStep("confirm");
  };

  // Step 2 -> step 1. Field edits are preserved because this component stays
  // mounted across the transition.
  const handleBackToFields = () => {
    if (isSubmitting) return;
    setStep("fields");
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = buildContributionPayload({
        entityType,
        entityId,
        entityVersion: (currentValues.version as number) ?? 1,
        changes: changedFields,
        editSummary,
        citation: { sourceType, sourceUrl, sourceDate },
      });

      const res = await fetch("/api/v1/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        const errMsg = typeof json.error === "string" ? json.error : json.error?.message;
        throw new Error(errMsg ?? "Failed to submit contribution");
      }

      setSubmitSuccess(true);
      setStep("fields");

      // Show success for 2 seconds, then close
      setTimeout(() => {
        onSubmitted();
        router.refresh(); // Refresh the page to show updated data if auto-approved
      }, 2000);
    } catch (error) {
      console.error("Error submitting contribution:", error);
      setSubmitError(error instanceof Error ? error.message : "Failed to submit contribution");
    } finally {
      setIsSubmitting(false);
    }
  };

  // The confirm dialog replaces the drawer rather than stacking on top of it,
  // so there is exactly one modal surface on screen at a time.
  if (step === "confirm") {
    return (
      <SubmitEditConfirmDialog
        isOpen
        entityName={entityName}
        changes={changeSummary}
        editSummary={editSummary}
        onEditSummaryChange={setEditSummary}
        sourceType={sourceType}
        sourceUrl={sourceUrl}
        sourceDate={sourceDate}
        onSourceTypeChange={setSourceType}
        onSourceUrlChange={setSourceUrl}
        onSourceDateChange={setSourceDate}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onBack={handleBackToFields}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <Drawer isOpen onClose={onClose}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default p-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-text-heading truncate">Suggest Edit</h2>
            <p className="text-sm text-text-muted truncate">{entityName}</p>
          </div>
          <Button variant="ghost" size="sm" onPress={onClose} className="ml-2 flex-shrink-0">
            <Icon name="X" size="sm" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {isLoadingFields && (
            <div className="flex items-center justify-center py-8">
              <Loader size={32} />
            </div>
          )}

          {fieldsError && (
            <div className="rounded-md bg-red-50 p-4 border border-red-200">
              <p className="text-sm font-medium text-red-800">Error loading fields</p>
              <p className="text-sm text-red-700 mt-1">{fieldsError}</p>
            </div>
          )}

          {!isLoadingFields && !fieldsError && fields.length === 0 && (
            <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
              <p className="text-sm font-medium text-blue-800">No editable fields</p>
              <p className="text-sm text-blue-700 mt-1">This entity type has no editable fields configured.</p>
            </div>
          )}

          {!isLoadingFields && !fieldsError && fields.length > 0 && (
            <>
              {/* Editable Fields */}
              <EntityFormFields fields={fields} formValues={formValues} onChange={handleFieldChange} mode="edit" />

              {/* Service Territory Note (for utilities only) */}
              {entityType === "utility" && (
                <div className="rounded-md bg-background-muted border border-border-default p-3">
                  <h4 className="text-sm font-medium text-text-body mb-1">Service Territory</h4>
                  <p className="text-xs text-text-muted">
                    Service territory boundary editing is not available via the website. Territory boundaries are
                    maintained from authoritative geospatial sources. Contact us for corrections.
                  </p>
                </div>
              )}

              {/* Changes Summary */}
              {hasChanges && (
                <div className="rounded-md bg-background-muted p-3 space-y-2">
                  <h4 className="text-sm font-semibold text-text-heading">Changes ({changeSummary.length})</h4>
                  <ul className="text-xs text-text-muted space-y-1">
                    {changeSummary.map((change) => (
                      <li key={change.fieldName}>• {change.displayName}</li>
                    ))}
                  </ul>
                  {summaryLongEnough && (
                    <p className="text-xs text-text-muted">
                      Your edit summary is saved. Continue to review and submit.
                    </p>
                  )}
                </div>
              )}

              {/* Submit Error (surfaced here too if the user backed out of the confirm step) */}
              {submitError && (
                <div className="rounded-md bg-red-50 p-4 border border-red-200">
                  <p className="text-sm font-medium text-red-800">Submission failed</p>
                  <p className="text-sm text-red-700 mt-1">{submitError}</p>
                </div>
              )}

              {/* Success Message */}
              {submitSuccess && (
                <div className="rounded-md bg-green-50 p-4 border border-green-200">
                  <p className="text-sm font-medium text-green-800">Contribution submitted!</p>
                  <p className="text-sm text-green-700 mt-1">
                    Your changes have been submitted for review. Thank you for contributing to CommonGrid!
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isLoadingFields && !fieldsError && fields.length > 0 && (
          <div className="border-t border-border-default p-4 space-y-2">
            {!hasChanges && <p className="text-xs text-text-muted">Change at least one field to continue.</p>}
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" size="md" onPress={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onPress={handleContinue} isDisabled={!hasChanges || submitSuccess}>
                Continue
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
