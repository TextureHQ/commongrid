"use client";

import {
  Button,
  Checkbox,
  CheckboxGroup,
  DateField,
  Dialog,
  Icon,
  NumberField,
  Select,
  Switch,
  TextArea,
  TextField,
} from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { conversionFetch } from "@/lib/analytics";
import { fromCalendarDate, toCalendarDate } from "@/lib/forms/date-value";
import { EDIT_SUMMARY_MIN_LENGTH } from "@/lib/mod/apply-contribution";
import { type EditableField, SOURCE_TYPE_OPTIONS } from "./EntityFormFields";

interface InlineFieldEditProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string;
  entityName: string;
  fieldName: string;
  currentValue: unknown;
  currentVersion: number;
  onSubmitted: () => void;
  /**
   * When provided, the dialog patches this existing contribution instead of
   * creating a new one. Used to edit-and-resubmit a contribution that a
   * moderator returned for changes.
   */
  existingContributionId?: string;
  /** Prefill the edit summary (used when editing an existing contribution). */
  initialEditSummary?: string;
  /** Prefill the proposed new value (used when editing an existing contribution). */
  initialProposedValue?: unknown;
  /** Prefill source citation fields (used when editing an existing contribution). */
  initialSourceType?: string;
  initialSourceUrl?: string;
  initialSourceDate?: string;
}

export function InlineFieldEdit({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  fieldName,
  currentValue,
  currentVersion,
  onSubmitted,
  existingContributionId,
  initialEditSummary,
  initialProposedValue,
  initialSourceType,
  initialSourceUrl,
  initialSourceDate,
}: InlineFieldEditProps) {
  const router = useRouter();

  // Field metadata
  const [field, setField] = useState<EditableField | null>(null);
  const [isLoadingField, setIsLoadingField] = useState(true);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Form state — when editing an existing contribution, prefill with its
  // previously-submitted values so the contributor can amend instead of restart.
  const [value, setValue] = useState<unknown>(initialProposedValue ?? currentValue);
  const [editSummary, setEditSummary] = useState(initialEditSummary ?? "");
  const [showSourceCitation, setShowSourceCitation] = useState(
    Boolean(initialSourceUrl || initialSourceDate || (initialSourceType && initialSourceType !== "utility_website"))
  );
  const [sourceType, setSourceType] = useState(initialSourceType ?? "utility_website");
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl ?? "");
  const [sourceDate, setSourceDate] = useState(initialSourceDate ?? "");

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Fetch field metadata
  useEffect(() => {
    if (!isOpen) return;

    const fetchField = async () => {
      try {
        setIsLoadingField(true);
        setFieldError(null);
        const res = await fetch(`/api/v1/editable-fields/${entityType}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch editable fields: ${res.statusText}`);
        }
        const json = await res.json();
        const fields = json.data ?? [];
        const targetField = fields.find((f: EditableField) => f.fieldName === fieldName);
        if (!targetField) {
          throw new Error(`Field ${fieldName} is not editable`);
        }
        setField(targetField);

        // Pre-fill edit summary — keep contributor's prior summary when editing
        // an existing contribution; only synthesize one for first-time edits.
        if (!initialEditSummary) {
          setEditSummary(`Updated ${targetField.displayName} for ${entityName}`);
        }
      } catch (error) {
        console.error("Error fetching field metadata:", error);
        setFieldError(error instanceof Error ? error.message : "Failed to load field metadata");
      } finally {
        setIsLoadingField(false);
      }
    };

    fetchField();
  }, [isOpen, entityType, fieldName, entityName, initialEditSummary]);

  // Reset form when the dialog opens. We intentionally only re-run on
  // `isOpen` changes — an upstream entity refetch during editing must NOT
  // wipe in-progress input by re-running this effect with new currentValue
  // or initial* props.
  // biome-ignore lint/correctness/useExhaustiveDependencies: form reset is keyed to open transition only
  useEffect(() => {
    if (isOpen) {
      setValue(initialProposedValue ?? currentValue);
      setSubmitError(null);
      setSubmitSuccess(false);
      setShowSourceCitation(
        Boolean(initialSourceUrl || initialSourceDate || (initialSourceType && initialSourceType !== "utility_website"))
      );
      setSourceUrl(initialSourceUrl ?? "");
      setSourceDate(initialSourceDate ?? "");
    }
  }, [isOpen]);

  const hasChanges = useMemo(() => {
    // Normalize null/undefined and empty strings
    const normalizedCurrent = currentValue === undefined || currentValue === "" ? null : currentValue;
    const normalizedNew = value === undefined || value === "" ? null : value;
    // Arrays/objects (multi_enum) compare by value, not reference.
    if (typeof normalizedCurrent === "object" || typeof normalizedNew === "object") {
      return JSON.stringify(normalizedNew) !== JSON.stringify(normalizedCurrent);
    }
    return normalizedNew !== normalizedCurrent;
  }, [currentValue, value]);

  const summaryLongEnough = editSummary.trim().length >= EDIT_SUMMARY_MIN_LENGTH;
  const canSubmit = hasChanges && summaryLongEnough && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !field) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      let url: string;
      let method: "POST" | "PATCH";
      let payload: Record<string, unknown>;

      if (existingContributionId) {
        // Editing an existing contribution — PATCH only the editable fields.
        // Server resets status to 'pending' when the prior status was
        // 'changes_requested', so this counts as a resubmission.
        url = `/api/v1/contributions/${existingContributionId}`;
        method = "PATCH";
        payload = {
          changes: { [fieldName]: value },
          edit_summary: editSummary.trim(),
          source_type: sourceType,
          source_url: sourceUrl || null,
          source_date: sourceDate || null,
        };
      } else {
        url = "/api/v1/contributions";
        method = "POST";
        payload = {
          entity_type: entityType,
          entity_id: entityId,
          entity_version: currentVersion,
          changes: { [fieldName]: value },
          edit_summary: editSummary.trim(),
          source_type: sourceType,
          source_url: sourceUrl || null,
          source_date: sourceDate || null,
        };
      }

      const res = await conversionFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        const errMsg = typeof json.error === "string" ? json.error : json.error?.message;
        throw new Error(errMsg ?? "Failed to submit contribution");
      }

      setSubmitSuccess(true);

      // Show success for 2 seconds, then close
      setTimeout(() => {
        onSubmitted();
        router.refresh();
      }, 2000);
    } catch (error) {
      console.error("Error submitting contribution:", error);
      setSubmitError(error instanceof Error ? error.message : "Failed to submit contribution");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderFieldInput = useCallback(() => {
    if (!field) return null;

    switch (field.fieldType) {
      case "text":
        return (
          <TextField
            label={field.displayName}
            value={(value as string) ?? ""}
            onChange={setValue}
            placeholder="Enter value"
          />
        );

      case "url":
        return (
          <TextField
            label={field.displayName}
            type="url"
            value={(value as string) ?? ""}
            onChange={setValue}
            placeholder="https://example.com"
          />
        );

      case "integer":
      case "float":
        return (
          <NumberField
            id={`field-${field.fieldName}`}
            label={field.displayName}
            // NumberField emits NaN when cleared; store null so an emptied field
            // round-trips as "no value" rather than a NaN that fails validation.
            value={typeof value === "number" ? value : Number.NaN}
            onChange={(next) => setValue(Number.isNaN(next) ? null : next)}
            minValue={field.validationRules?.min}
            maxValue={field.validationRules?.max}
            step={field.fieldType === "integer" ? 1 : undefined}
            formatOptions={field.fieldType === "integer" ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 20 }}
          />
        );

      case "boolean":
        return (
          <Switch isSelected={(value as boolean) ?? false} onChange={setValue}>
            {field.displayName}
          </Switch>
        );

      case "multi_enum": {
        const options = field.validationRules?.enum ?? [];
        const selected = Array.isArray(value) ? (value as string[]) : [];
        const humanize = (option: string) => option.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

        return (
          <CheckboxGroup
            label={field.displayName}
            value={selected}
            // CheckboxGroup hands back the selected values in click order;
            // reorder to the canonical option order so the emitted array is
            // stable no matter how the user got there.
            onChange={(next) => setValue(options.filter((item) => next.includes(item)))}
          >
            <div className="grid gap-2 rounded-md border border-border-default bg-background-body p-3 sm:grid-cols-2">
              {options.map((option) => (
                <Checkbox key={option} value={option}>
                  {humanize(option)}
                </Checkbox>
              ))}
            </div>
          </CheckboxGroup>
        );
      }

      case "enum": {
        const enumOptions = (field.validationRules?.enum ?? []).map((option) => ({
          id: option,
          label: option.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          value: option,
        }));

        const currentLabel = currentValue
          ? String(currentValue)
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())
          : "None";

        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-text-body">Current Value</div>
              <div className="text-sm text-text-muted">{currentLabel}</div>
            </div>
            <Select
              label="New Value"
              selectedKey={(value as string) || undefined}
              onSelectionChange={(key) => setValue(key ? String(key) : "")}
              items={enumOptions}
              renderItem={(item) => item.label}
              placeholder="-- Select --"
            />
          </div>
        );
      }

      default:
        return (
          <TextField
            label={field.displayName}
            value={(value as string) ?? ""}
            onChange={setValue}
            placeholder="Enter value"
          />
        );
    }
  }, [field, value, currentValue]);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Edit ${field?.displayName ?? "Field"}`}>
      <div className="space-y-4 p-4">
        {fieldError && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700 mt-1">{fieldError}</p>
          </div>
        )}

        {!fieldError && (
          <>
            {/* Field Input */}
            <div className="space-y-2">
              {isLoadingField ? (
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-background-muted animate-pulse rounded" />
                  <div className="h-10 w-full bg-background-muted animate-pulse rounded-md" />
                </div>
              ) : (
                renderFieldInput()
              )}
            </div>

            {/* Edit Summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="edit-summary" className="text-sm font-medium text-text-body">
                  Edit Summary <span className="text-feedback-error">*</span>
                </label>
                <div className="flex items-center gap-1">
                  <span className={`text-xs ${summaryLongEnough ? "text-feedback-success" : "text-text-muted"}`}>
                    {editSummary.trim().length}/{EDIT_SUMMARY_MIN_LENGTH}
                  </span>
                  {summaryLongEnough && <Icon name="CheckCircle" size="sm" className="text-feedback-success" />}
                </div>
              </div>
              <TextArea
                id="edit-summary"
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder={`Describe your change (minimum ${EDIT_SUMMARY_MIN_LENGTH} characters)`}
                rows={2}
                description="A short description helps reviewers verify your update."
              />
            </div>

            {/* Source Citation (Collapsible) */}
            <div className="border-t border-border-default pt-4">
              <button
                type="button"
                onClick={() => setShowSourceCitation(!showSourceCitation)}
                className="flex items-center gap-2 text-sm font-medium text-text-body hover:text-text-heading"
              >
                <Icon name={showSourceCitation ? "CaretDown" : "CaretRight"} size="sm" />
                Add source citation (optional)
              </button>

              {showSourceCitation && (
                <div className="mt-3 space-y-3">
                  <Select
                    label="Source Type"
                    selectedKey={sourceType}
                    onSelectionChange={(key) => setSourceType(String(key))}
                    items={SOURCE_TYPE_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label, value: opt.value }))}
                    renderItem={(item) => item.label}
                  />

                  <TextField
                    label="Source URL"
                    type="url"
                    value={sourceUrl}
                    onChange={setSourceUrl}
                    placeholder="https://example.com/source"
                  />

                  <DateField
                    label="Source Date"
                    // biome-ignore lint/suspicious/noExplicitAny: cross-package CalendarDate brand mismatch
                    value={toCalendarDate(sourceDate) as any}
                    onChange={(date) => setSourceDate(fromCalendarDate(date))}
                  />
                </div>
              )}
            </div>

            {/* Submit Error */}
            {submitError && (
              <div className="rounded-md bg-red-50 p-4 border border-red-200">
                <p className="text-sm font-medium text-red-800">Submission failed</p>
                <p className="text-sm text-red-700 mt-1">{submitError}</p>
              </div>
            )}

            {/* Success Message */}
            {submitSuccess && (
              <div className="rounded-md bg-green-50 p-4 border border-green-200">
                <p className="text-sm font-medium text-green-800">
                  {existingContributionId ? "Changes resubmitted!" : "Changes submitted!"}
                </p>
                <p className="text-sm text-green-700 mt-1">Thank you for improving CommonGrid data quality.</p>
              </div>
            )}
          </>
        )}

        {/* Footer with buttons */}
        {!fieldError && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-default mt-6">
            <Button variant="secondary" onPress={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={!canSubmit || isLoadingField}>
              {isSubmitting ? "Submitting..." : "Submit Changes"}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
