"use client";

/**
 * The Suggest Edit flow, as state.
 *
 * Two surfaces run this flow and must behave identically: the drawer used on
 * full detail pages, and the in-panel slide-over used inside Explore (where a
 * drawer would stack on top of the panel that opened it). Keeping the fetch,
 * the change diffing and the submit here means the two can never drift apart —
 * only their chrome differs.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  buildContributionPayload,
  canContinueToConfirm,
  canSubmitContribution,
  computeChangedFields,
  isEditSummaryValid,
  lookupEntityValue,
} from "@/lib/contributions/edit-submission";
import { EDIT_SUMMARY_MIN_LENGTH } from "@/lib/mod/apply-contribution";
import type { EditableField } from "./EntityFormFields";
import type { ChangeSummaryItem } from "./SubmitEditConfirmDialog";

/** Which step of the Suggest Edit flow is on screen. */
export type EditStep = "fields" | "confirm";

/** Stable identity so an empty schema does not retrigger the seeding effect. */
const EMPTY_FIELDS: EditableField[] = [];

async function fetchEditableFields(url: string): Promise<EditableField[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch editable fields: ${res.statusText}`);
  const json = await res.json();
  return json.data ?? [];
}

export interface UseEditEntityFlowOptions {
  entityType: string;
  entityId: string;
  entityName: string;
  currentValues: Record<string, unknown>;
  /**
   * Called once the contribution has been accepted by the API.
   *
   * The drawer uses this to close itself; the in-panel variant uses it to slide
   * back to the entity view and raise a status banner. Because the two want
   * different timing, the flow does not close anything itself.
   */
  onSubmitted: () => void;
}

export function useEditEntityFlow({
  entityType,
  entityId,
  entityName: _entityName,
  currentValues,
  onSubmitted,
}: UseEditEntityFlowOptions) {
  const router = useRouter();

  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [sourceType, setSourceType] = useState("utility_website");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [editSummary, setEditSummary] = useState("");

  const [step, setStep] = useState<EditStep>("fields");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const lookupCurrentValue = useCallback(
    (fieldName: string): unknown => lookupEntityValue(currentValues, fieldName),
    [currentValues]
  );

  // The editable-field schema is configuration, not per-visit data: it changes
  // when someone edits the database, not between two openings of this panel.
  // Re-fetching it on every open put a spinner in front of the form each time
  // for a response that had not changed, so it is cached for the session.
  const {
    data: fields = EMPTY_FIELDS,
    error: fieldsFetchError,
    isLoading: isLoadingFields,
  } = useSWR<EditableField[]>(`/api/v1/editable-fields/${entityType}`, fetchEditableFields, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 3_600_000,
  });

  const fieldsError = fieldsFetchError ? (fieldsFetchError as Error).message : null;

  // Seed the form once the schema arrives, looking values up by both
  // snake_case and camelCase to absorb the API/payload mismatch.
  useEffect(() => {
    if (fields.length === 0) return;
    const initialValues: Record<string, unknown> = {};
    for (const field of fields) {
      initialValues[field.fieldName] = lookupCurrentValue(field.fieldName);
    }
    setFormValues(initialValues);
  }, [fields, lookupCurrentValue]);

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

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  /** Step 1 -> step 2. Nothing is sent yet. */
  const goToConfirm = useCallback(() => {
    if (!hasChanges) return;
    setSubmitError(null);
    setStep("confirm");
  }, [hasChanges]);

  /** Step 2 -> step 1. Edits survive because this state is not unmounted. */
  const goBackToFields = useCallback(() => {
    if (isSubmitting) return;
    setStep("fields");
  }, [isSubmitting]);

  const submit = useCallback(async () => {
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

      onSubmitted();
      // Pick up the new value when the edit was auto-approved.
      router.refresh();
    } catch (error) {
      console.error("Error submitting contribution:", error);
      setSubmitError(error instanceof Error ? error.message : "Failed to submit contribution");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    isSubmitting,
    entityType,
    entityId,
    currentValues,
    changedFields,
    editSummary,
    sourceType,
    sourceUrl,
    sourceDate,
    onSubmitted,
    router,
  ]);

  return {
    fields,
    isLoadingFields,
    fieldsError,
    formValues,
    handleFieldChange,
    editSummary,
    setEditSummary,
    sourceType,
    setSourceType,
    sourceUrl,
    setSourceUrl,
    sourceDate,
    setSourceDate,
    step,
    goToConfirm,
    goBackToFields,
    isSubmitting,
    submitError,
    changeSummary,
    hasChanges,
    summaryLongEnough,
    canSubmit,
    submit,
  };
}
