"use client";

import { Button, Icon, Loader, PageLayout } from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  type EditableField,
  EditSummaryField,
  EntityFormFields,
  SourceCitationFields,
} from "@/components/contributions/EntityFormFields";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function CreateUtilityPage() {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useCurrentUser();

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

  // Duplicate check state
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Fetch editable fields on mount
  useEffect(() => {
    const fetchFields = async () => {
      try {
        setIsLoadingFields(true);
        setFieldsError(null);
        const res = await fetch("/api/v1/editable-fields/utility");
        if (!res.ok) {
          throw new Error(`Failed to fetch editable fields: ${res.statusText}`);
        }
        const json = await res.json();
        setFields(json.data ?? []);

        // Initialize form values to empty
        const initialValues: Record<string, unknown> = {};
        for (const field of json.data ?? []) {
          initialValues[field.fieldName] = null;
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
  }, []);

  // Pre-fill edit summary when name changes
  useEffect(() => {
    if (formValues.name && typeof formValues.name === "string") {
      setEditSummary(`Added new utility: ${formValues.name}`);
    }
  }, [formValues.name]);

  // Duplicate check when name changes (debounced)
  useEffect(() => {
    const name = formValues.name;
    if (!name || typeof name !== "string" || name.trim().length < 3) {
      setDuplicateWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/utilities?q=${encodeURIComponent(name.trim())}&limit=5`);
        if (res.ok) {
          const json = await res.json();
          const matches = json.data?.filter((u: { name: string }) =>
            u.name.toLowerCase().includes(name.toLowerCase())
          );
          if (matches && matches.length > 0) {
            setDuplicateWarning(
              `A utility named "${matches[0].name}" already exists. Did you mean to edit it instead?`
            );
          } else {
            setDuplicateWarning(null);
          }
        }
      } catch (error) {
        // Silently fail duplicate check
        console.error("Duplicate check failed:", error);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formValues.name]);

  const handleFieldChange = (fieldName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  // Prepare changes object: all non-null fields as { old: null, new: value }
  const changes = useMemo(() => {
    const result: Record<string, { old: null; new: unknown }> = {};
    for (const [key, value] of Object.entries(formValues)) {
      if (value !== null && value !== "" && value !== undefined) {
        result[key] = { old: null, new: value };
      }
    }
    return result;
  }, [formValues]);

  const hasRequiredFields = !!formValues.name;
  const canSubmit = hasRequiredFields && editSummary.trim().length >= 25 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = {
        entity_type: "utility",
        entity_id: crypto.randomUUID(), // Temporary ID for create
        entity_version: 0, // Create starts at version 0
        change_type: "create",
        changes,
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

      // Redirect after success
      setTimeout(() => {
        // If auto-approved, redirect to the new entity page
        if (json.auto_approved && json.data?.entitySlug) {
          router.push(`/grid-operators/${json.data.entitySlug}`);
        } else {
          // Otherwise, redirect to the list
          router.push("/grid-operators");
        }
      }, 2000);
    } catch (error) {
      console.error("Error submitting contribution:", error);
      setSubmitError(error instanceof Error ? error.message : "Failed to submit contribution");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Require auth
  if (isUserLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    return (
      <PageLayout>
        <PageLayout.Header title="Add New Utility" />
        <PageLayout.Content>
          <div className="max-w-2xl mx-auto py-8">
            <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
              <p className="text-sm font-medium text-blue-800">Sign in required</p>
              <p className="text-sm text-blue-700 mt-1">You need to be signed in to add a new utility.</p>
            </div>
          </div>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header title="Add New Utility" />
      <PageLayout.Content>
        <div className="max-w-2xl mx-auto py-8 space-y-6">
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
              {/* Duplicate Warning */}
              {duplicateWarning && (
                <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
                  <p className="text-sm font-medium text-yellow-800">Possible Duplicate</p>
                  <p className="text-sm text-yellow-700 mt-1">{duplicateWarning}</p>
                </div>
              )}

              {/* Form Fields */}
              <EntityFormFields fields={fields} formValues={formValues} onChange={handleFieldChange} mode="create" />

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
                  <p className="text-sm font-medium text-green-800">Utility added!</p>
                  <p className="text-sm text-green-700 mt-1">
                    Your new utility has been submitted. Thank you for contributing to CommonGrid!
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-default">
                <Button variant="secondary" size="md" onPress={() => router.back()}>
                  Cancel
                </Button>
                <Button variant="primary" size="md" onPress={handleSubmit} isDisabled={!canSubmit}>
                  {isSubmitting ? (
                    <>
                      <Loader size={16} />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="Check" size="sm" />
                      <span>Submit</span>
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}
