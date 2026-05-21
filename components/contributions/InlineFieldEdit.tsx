"use client";

import { Button, Dialog, Icon, TextField } from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
}: InlineFieldEditProps) {
  const router = useRouter();

  // Field metadata
  const [field, setField] = useState<EditableField | null>(null);
  const [isLoadingField, setIsLoadingField] = useState(true);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Form state
  const [value, setValue] = useState<unknown>(currentValue);
  const [editSummary, setEditSummary] = useState("");
  const [showSourceCitation, setShowSourceCitation] = useState(false);
  const [sourceType, setSourceType] = useState("utility_website");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDate, setSourceDate] = useState("");

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

        // Pre-fill edit summary
        setEditSummary(`Updated ${targetField.displayName} for ${entityName}`);
      } catch (error) {
        console.error("Error fetching field metadata:", error);
        setFieldError(error instanceof Error ? error.message : "Failed to load field metadata");
      } finally {
        setIsLoadingField(false);
      }
    };

    fetchField();
  }, [isOpen, entityType, fieldName, entityName]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(currentValue);
      setSubmitError(null);
      setSubmitSuccess(false);
      setShowSourceCitation(false);
      setSourceUrl("");
      setSourceDate("");
    }
  }, [isOpen, currentValue]);

  const hasChanges = useMemo(() => {
    // Normalize null/undefined and empty strings
    const normalizedCurrent = currentValue === undefined || currentValue === "" ? null : currentValue;
    const normalizedNew = value === undefined || value === "" ? null : value;
    return normalizedNew !== normalizedCurrent;
  }, [currentValue, value]);

  const summaryLongEnough = editSummary.trim().length >= 15;
  const canSubmit = hasChanges && summaryLongEnough && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !field) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = {
        entity_type: entityType,
        entity_id: entityId,
        entity_version: currentVersion,
        changes: {
          [fieldName]: value,
        },
        edit_summary: editSummary.trim(),
        source_type: sourceType,
        source_url: sourceUrl || null,
        source_date: sourceDate || null,
      };

      const res = await fetch("/api/v1/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to submit contribution");
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
        return (
          <div className="space-y-2">
            <label htmlFor={`field-${field.fieldName}`} className="text-sm font-medium text-text-body">
              {field.displayName}
            </label>
            <input
              id={`field-${field.fieldName}`}
              type="number"
              step="1"
              value={value !== null && value !== undefined ? String(value) : ""}
              onChange={(e) => setValue(e.target.value ? parseInt(e.target.value, 10) : null)}
              min={field.validationRules?.min}
              max={field.validationRules?.max}
              placeholder="Enter a number"
              className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-disabled placeholder:opacity-60 focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>
        );

      case "float":
        return (
          <div className="space-y-2">
            <label htmlFor={`field-${field.fieldName}`} className="text-sm font-medium text-text-body">
              {field.displayName}
            </label>
            <input
              id={`field-${field.fieldName}`}
              type="number"
              step="any"
              value={value !== null && value !== undefined ? String(value) : ""}
              onChange={(e) => setValue(e.target.value ? parseFloat(e.target.value) : null)}
              min={field.validationRules?.min}
              max={field.validationRules?.max}
              placeholder="Enter a number"
              className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-disabled placeholder:opacity-60 focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>
        );

      case "boolean":
        return (
          <div className="space-y-2">
            <label htmlFor={`field-${field.fieldName}`} className="text-sm font-medium text-text-body">
              {field.displayName}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`field-${field.fieldName}`}
                type="checkbox"
                checked={(value as boolean) ?? false}
                onChange={(e) => setValue(e.target.checked)}
                className="h-4 w-4 rounded border-border-default text-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              />
              <span className="text-sm text-text-body">{value ? "Yes" : "No"}</span>
            </div>
          </div>
        );

      case "enum":
        return (
          <div className="space-y-2">
            <label htmlFor={`field-${field.fieldName}`} className="text-sm font-medium text-text-body">
              {field.displayName}
            </label>
            <select
              id={`field-${field.fieldName}`}
              value={(value as string) ?? ""}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            >
              <option value="">-- Select --</option>
              {field.validationRules?.enum?.map((option) => (
                <option key={option} value={option}>
                  {option.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        );

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
  }, [field, value]);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Edit ${field?.displayName ?? "Field"}`}>
      <div className="space-y-4 p-4">
        {isLoadingField && <div className="text-sm text-text-muted">Loading field metadata...</div>}

        {fieldError && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700 mt-1">{fieldError}</p>
          </div>
        )}

        {!isLoadingField && !fieldError && field && (
          <>
            {/* Field Input */}
            <div className="space-y-2">{renderFieldInput()}</div>

            {/* Edit Summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="edit-summary" className="text-sm font-medium text-text-body">
                  Edit Summary <span className="text-feedback-error">*</span>
                </label>
                <div className="flex items-center gap-1">
                  <span className={`text-xs ${summaryLongEnough ? "text-feedback-success" : "text-text-muted"}`}>
                    {editSummary.trim().length}/15
                  </span>
                  {summaryLongEnough && <Icon name="CheckCircle" size="sm" className="text-feedback-success" />}
                </div>
              </div>
              <textarea
                id="edit-summary"
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder="Describe your change (minimum 15 characters)"
                rows={2}
                className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-disabled placeholder:opacity-60 focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              />
              <p className="text-xs text-text-muted">Example: "Updated customer count from 2023 annual report"</p>
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
                  <div className="space-y-1">
                    <label htmlFor="source-type" className="text-sm font-medium text-text-body">
                      Source Type
                    </label>
                    <select
                      id="source-type"
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value)}
                      className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    >
                      {SOURCE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <TextField
                    label="Source URL"
                    type="url"
                    value={sourceUrl}
                    onChange={setSourceUrl}
                    placeholder="https://example.com/source"
                  />

                  <div className="space-y-1">
                    <label htmlFor="source-date" className="text-sm font-medium text-text-body">
                      Source Date
                    </label>
                    <input
                      id="source-date"
                      type="date"
                      value={sourceDate}
                      onChange={(e) => setSourceDate(e.target.value)}
                      className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    />
                  </div>
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
                <p className="text-sm font-medium text-green-800">Changes submitted!</p>
                <p className="text-sm text-green-700 mt-1">Thank you for improving CommonGrid data quality.</p>
              </div>
            )}

            {/* Help Text */}
            {!hasChanges && <p className="text-xs text-text-muted">Change the field value to enable submission.</p>}
            {hasChanges && !summaryLongEnough && (
              <p className="text-xs text-text-muted">Add a descriptive edit summary (at least 15 characters).</p>
            )}
          </>
        )}

        {/* Footer with buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-default mt-6">
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onPress={handleSubmit} isDisabled={!canSubmit}>
            {isSubmitting ? "Submitting..." : "Submit Changes"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
