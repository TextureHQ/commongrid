"use client";

import { Button, Icon, Loader, PageLayout } from "@texturehq/edges";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  type EditableField,
  EditSummaryField,
  EntityFormFields,
  SourceCitationFields,
} from "@/components/contributions/EntityFormFields";
import { UtilityAutocomplete } from "@/components/UtilityAutocomplete";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUtility } from "@/hooks/useUtility";
import { parseNewProgramUtilityParam } from "@/lib/programs/new-program-link";
import type { UtilityOption } from "@/lib/utility-search";

function CreateProgramForm() {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const searchParams = useSearchParams();

  /**
   * Utility to preselect as administrator, from `?utility=<slug>`. Read once on
   * mount: entry points such as the utility detail panel pass it so contributors
   * don't have to re-find the utility they were just looking at, but after that
   * the picker owns the selection and must not be reset by a URL change.
   */
  const [initialUtilitySlug] = useState(() => parseNewProgramUtilityParam(searchParams.get("utility")));

  const [fields, setFields] = useState<EditableField[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(true);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  // Utility association (not part of editable-fields since it's a complex type)
  const [adminUtilitySlug, setAdminUtilitySlug] = useState(initialUtilitySlug);

  /**
   * The picker labels its selection from its own option list, so a slug arriving
   * via the URL needs the matching name supplied or the field looks empty even
   * though the association is set.
   */
  const { utility: prefilledUtility } = useUtility(initialUtilitySlug || null);
  const utilitySeedOptions = useMemo<UtilityOption[]>(
    () => (prefilledUtility ? [{ id: prefilledUtility.slug, name: prefilledUtility.name }] : []),
    [prefilledUtility]
  );

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
        const res = await fetch("/api/v1/editable-fields/program");
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
      setEditSummary(`Added new program: ${formValues.name}`);
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
        const res = await fetch(`/api/v1/programs?q=${encodeURIComponent(name.trim())}&limit=5`);
        if (res.ok) {
          const json = await res.json();
          const matches = json.data?.filter((p: { name: string }) => p.name.toLowerCase().includes(name.toLowerCase()));
          if (matches && matches.length > 0) {
            setDuplicateWarning(
              `A program named "${matches[0].name}" already exists. Did you mean to edit it instead?`
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
        entity_type: "program",
        entity_id: crypto.randomUUID(),
        entity_version: 0,
        change_type: "create",
        changes: {
          ...changes,
          ...(adminUtilitySlug
            ? { organizations: { old: null, new: [{ entityId: adminUtilitySlug, role: "ADMINISTRATOR" }] } }
            : {}),
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
        const errMsg = typeof json.error === "string" ? json.error : json.error?.message;
        throw new Error(errMsg ?? "Failed to submit contribution");
      }

      setSubmitSuccess(true);

      // Redirect after success
      setTimeout(() => {
        router.push("/explore?tab=programs");
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
        <PageLayout.Header title="Add New Program" />
        <PageLayout.Content>
          <div className="max-w-2xl mx-auto py-8">
            <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
              <p className="text-sm font-medium text-blue-800">Sign in required</p>
              <p className="text-sm text-blue-700 mt-1">You need to be signed in to add a new program.</p>
            </div>
          </div>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header title="Add New Program" />
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
              <p className="text-sm text-blue-700 mt-1">This entity type has no editable fields configured yet.</p>
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

              {/* Utility Association */}
              <UtilityAutocomplete
                label="Administrator Utility"
                description="The utility that administers this demand-response or rebate program."
                value={adminUtilitySlug}
                onChange={setAdminUtilitySlug}
                seedOptions={utilitySeedOptions}
              />

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
                  <p className="text-sm font-medium text-green-800">Program submitted!</p>
                  <p className="text-sm text-green-700 mt-1">
                    Your new program has been submitted. Thank you for contributing to CommonGrid!
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

/**
 * `useSearchParams` opts the subtree into client-side rendering, so the form is
 * wrapped in Suspense to keep the rest of the route statically prerenderable.
 */
export default function CreateProgramPage() {
  return (
    <Suspense
      fallback={
        <PageLayout>
          <div className="flex items-center justify-center py-24">
            <Loader size={32} />
          </div>
        </PageLayout>
      }
    >
      <CreateProgramForm />
    </Suspense>
  );
}
