"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Drawer,
  Button,
  Icon,
  Loader,
  Badge,
} from "@texturehq/edges";
import { useRouter } from "next/navigation";

interface EditableField {
  fieldName: string;
  fieldType: "text" | "integer" | "float" | "boolean" | "enum" | "url";
  isCritical: boolean;
  displayName: string;
  validationRules?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: string[];
  };
}

interface EditEntityPanelProps {
  entityType: string;
  entityId: string;
  entitySlug: string;
  entityName: string;
  currentValues: Record<string, unknown>;
  onClose: () => void;
  onSubmitted: () => void;
}

const SOURCE_TYPE_OPTIONS = [
  { value: "eia_filing", label: "EIA Filing" },
  { value: "utility_website", label: "Utility Website" },
  { value: "state_puc", label: "State PUC" },
  { value: "sec_filing", label: "SEC Filing" },
  { value: "ferc_filing", label: "FERC Filing" },
  { value: "news_article", label: "News Article" },
  { value: "academic_paper", label: "Academic Paper" },
  { value: "government_db", label: "Government Database" },
  { value: "personal_observation", label: "Personal Observation" },
  { value: "other", label: "Other" },
];

export function EditEntityPanel({
  entityType,
  entityId,
  entitySlug,
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

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

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

        // Initialize form values with current values
        const initialValues: Record<string, unknown> = {};
        for (const field of json.data ?? []) {
          initialValues[field.fieldName] = currentValues[field.fieldName];
        }
        setFormValues(initialValues);
      } catch (error) {
        console.error("Error fetching editable fields:", error);
        setFieldsError(
          error instanceof Error ? error.message : "Failed to load editable fields"
        );
      } finally {
        setIsLoadingFields(false);
      }
    };

    fetchFields();
  }, [entityType, currentValues]);

  // Calculate changed fields
  const changedFields = useMemo(() => {
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(formValues)) {
      const currentValue = currentValues[key];
      if (value !== currentValue) {
        changes[key] = value;
      }
    }
    return changes;
  }, [formValues, currentValues]);

  const hasChanges = Object.keys(changedFields).length > 0;
  const canSubmit =
    hasChanges && editSummary.trim().length >= 25 && !isSubmitting;

  const handleFieldChange = (fieldName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = {
        entity_type: entityType,
        entity_id: entityId,
        entity_version: (currentValues.version as number) ?? 1,
        changes: changedFields,
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

      const json = await res.json();
      setSubmitSuccess(true);

      // Show success for 2 seconds, then close
      setTimeout(() => {
        onSubmitted();
        router.refresh(); // Refresh the page to show updated data if auto-approved
      }, 2000);
    } catch (error) {
      console.error("Error submitting contribution:", error);
      setSubmitError(
        error instanceof Error ? error.message : "Failed to submit contribution"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer isOpen onClose={onClose}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default p-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-text-heading truncate">
              Suggest Edit
            </h2>
            <p className="text-sm text-text-muted truncate">{entityName}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onPress={onClose}
            className="ml-2 flex-shrink-0"
          >
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
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-text-heading">
                  Fields
                </h3>
                {fields.map((field) => (
                  <div key={field.fieldName} className="space-y-1">
                    <label
                      htmlFor={field.fieldName}
                      className="flex items-center gap-2 text-sm font-medium text-text-body"
                    >
                      {field.displayName}
                      {field.isCritical && (
                        <Badge variant="warning" size="sm">
                          Critical
                        </Badge>
                      )}
                    </label>
                    {renderFieldInput(
                      field,
                      formValues[field.fieldName],
                      handleFieldChange
                    )}
                  </div>
                ))}
              </div>

              {/* Changes Summary */}
              {hasChanges && (
                <div className="rounded-md bg-background-muted p-3 space-y-2">
                  <h4 className="text-sm font-semibold text-text-heading">
                    Changes ({Object.keys(changedFields).length})
                  </h4>
                  <ul className="text-xs text-text-muted space-y-1">
                    {Object.keys(changedFields).map((fieldName) => {
                      const field = fields.find((f) => f.fieldName === fieldName);
                      return (
                        <li key={fieldName}>
                          • {field?.displayName ?? fieldName}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Source Citation */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-text-heading">
                  Source Citation
                </h3>

                <div className="space-y-1">
                  <label
                    htmlFor="sourceType"
                    className="text-sm font-medium text-text-body"
                  >
                    Source Type
                  </label>
                  <select
                    id="sourceType"
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

                <div className="space-y-1">
                  <label
                    htmlFor="sourceUrl"
                    className="text-sm font-medium text-text-body"
                  >
                    Source URL (optional)
                  </label>
                  <input
                    id="sourceUrl"
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="sourceDate"
                    className="text-sm font-medium text-text-body"
                  >
                    Source Date (optional)
                  </label>
                  <input
                    id="sourceDate"
                    type="date"
                    value={sourceDate}
                    onChange={(e) => setSourceDate(e.target.value)}
                    className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  />
                </div>
              </div>

              {/* Edit Summary */}
              <div className="space-y-1">
                <label
                  htmlFor="editSummary"
                  className="flex items-center justify-between text-sm font-medium text-text-body"
                >
                  <span>
                    Edit Summary <span className="text-feedback-error">*</span>
                  </span>
                  <span
                    className={`text-xs ${
                      editSummary.trim().length >= 25
                        ? "text-feedback-success"
                        : "text-text-muted"
                    }`}
                  >
                    {editSummary.trim().length}/25
                  </span>
                </label>
                <textarea
                  id="editSummary"
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  placeholder="Describe the changes you're making (minimum 25 characters)"
                  rows={3}
                  className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                />
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
                  <p className="text-sm font-medium text-green-800">Contribution submitted!</p>
                  <p className="text-sm text-green-700 mt-1">Your changes have been submitted for review. Thank you for
                  contributing to CommonGrid!</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isLoadingFields && !fieldsError && fields.length > 0 && (
          <div className="border-t border-border-default p-4 flex items-center justify-end gap-3">
            <Button variant="secondary" size="md" onPress={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={handleSubmit}
              isDisabled={!canSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader size={16} />
                  <span>Submitting...</span>
                </>
              ) : (
                "Submit Edit"
              )}
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/**
 * Render the appropriate input field based on field type
 */
function renderFieldInput(
  field: EditableField,
  value: unknown,
  onChange: (fieldName: string, value: unknown) => void
) {
  const inputClassName =
    "w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20";

  switch (field.fieldType) {
    case "text":
      return (
        <input
          id={field.fieldName}
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          className={inputClassName}
        />
      );

    case "url":
      return (
        <input
          id={field.fieldName}
          type="url"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          placeholder="https://..."
          className={inputClassName}
        />
      );

    case "integer":
      return (
        <input
          id={field.fieldName}
          type="number"
          step="1"
          value={(value as number) ?? ""}
          onChange={(e) =>
            onChange(field.fieldName, e.target.value ? parseInt(e.target.value, 10) : null)
          }
          min={field.validationRules?.min}
          max={field.validationRules?.max}
          className={inputClassName}
        />
      );

    case "float":
      return (
        <input
          id={field.fieldName}
          type="number"
          step="any"
          value={(value as number) ?? ""}
          onChange={(e) =>
            onChange(field.fieldName, e.target.value ? parseFloat(e.target.value) : null)
          }
          min={field.validationRules?.min}
          max={field.validationRules?.max}
          className={inputClassName}
        />
      );

    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <input
            id={field.fieldName}
            type="checkbox"
            checked={(value as boolean) ?? false}
            onChange={(e) => onChange(field.fieldName, e.target.checked)}
            className="h-4 w-4 rounded border-border-default text-brand-primary focus:ring-2 focus:ring-brand-primary/20"
          />
          <label htmlFor={field.fieldName} className="text-sm text-text-body">
            {value ? "Yes" : "No"}
          </label>
        </div>
      );

    case "enum":
      return (
        <select
          id={field.fieldName}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          className={inputClassName}
        >
          <option value="">-- Select --</option>
          {field.validationRules?.enum?.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      );

    default:
      return (
        <input
          id={field.fieldName}
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          className={inputClassName}
        />
      );
  }
}
