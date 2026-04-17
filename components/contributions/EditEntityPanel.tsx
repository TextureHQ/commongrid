"use client";

import { Button, Drawer, Icon, Loader } from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  type EditableField,
  EditSummaryField,
  EntityFormFields,
  SourceCitationFields,
} from "./EntityFormFields";

interface EditEntityPanelProps {
  entityType: string;
  entityId: string;
  entitySlug: string;
  entityName: string;
  currentValues: Record<string, unknown>;
  onClose: () => void;
  onSubmitted: () => void;
}

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
        setFieldsError(error instanceof Error ? error.message : "Failed to load editable fields");
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
  const canSubmit = hasChanges && editSummary.trim().length >= 25 && !isSubmitting;

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

      const _json = await res.json();
      setSubmitSuccess(true);

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

              {/* Changes Summary */}
              {hasChanges && (
                <div className="rounded-md bg-background-muted p-3 space-y-2">
                  <h4 className="text-sm font-semibold text-text-heading">
                    Changes ({Object.keys(changedFields).length})
                  </h4>
                  <ul className="text-xs text-text-muted space-y-1">
                    {Object.keys(changedFields).map((fieldName) => {
                      const field = fields.find((f) => f.fieldName === fieldName);
                      return <li key={fieldName}>• {field?.displayName ?? fieldName}</li>;
                    })}
                  </ul>
                </div>
              )}

              {/* Source Citation */}
              <SourceCitationFields
                sourceType={sourceType}
                sourceUrl={sourceUrl}
                sourceDate={sourceDate}
                onSourceTypeChange={setSourceType}
                onSourceUrlChange={setSourceUrl}
                onSourceDateChange={setSourceDate}
              />

              {/* Edit Summary */}
              <EditSummaryField value={editSummary} onChange={setEditSummary} />

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
          <div className="border-t border-border-default p-4 flex items-center justify-end gap-3">
            <Button variant="secondary" size="md" onPress={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onPress={handleSubmit} isDisabled={!canSubmit}>
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
