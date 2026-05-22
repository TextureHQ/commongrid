"use client";

import { useAuth } from "@clerk/nextjs";
import { Button, Icon, Select, TextArea, TextField } from "@texturehq/edges";
import { useCallback, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditableField {
  /** DB column name */
  name: string;
  /** Human label */
  label: string;
  /** Display section heading */
  section: string;
  /** Field type for input rendering */
  type: "text" | "number" | "url" | "boolean";
  /** Current value */
  currentValue: string | number | boolean | null;
}

export interface EditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string;
  entitySlug: string;
  entityVersion: number;
  entityName: string;
  fields: EditableField[];
  onSuccess?: () => void;
}

const SOURCE_TYPES = [
  { id: "eia_filing", label: "EIA Filing" },
  { id: "utility_website", label: "Utility Website" },
  { id: "state_puc", label: "State PUC" },
  { id: "sec_filing", label: "SEC Filing" },
  { id: "ferc_filing", label: "FERC Filing" },
  { id: "news_article", label: "News Article" },
  { id: "academic_paper", label: "Academic Paper" },
  { id: "government_db", label: "Government Database" },
  { id: "personal_observation", label: "Personal Observation" },
  { id: "other", label: "Other" },
] as const;

type FieldChanges = Record<string, { old: string | number | boolean | null; new: string | number | boolean | null }>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditPanel({
  isOpen,
  onClose,
  entityType,
  entityId,
  entitySlug,
  entityVersion,
  entityName,
  fields,
  onSuccess,
}: EditPanelProps) {
  const { getToken } = useAuth();

  // Form state
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [sourceType, setSourceType] = useState<string>("utility_website");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Group fields by section
  const sections = useMemo(() => {
    const map = new Map<string, EditableField[]>();
    for (const field of fields) {
      const existing = map.get(field.section) ?? [];
      existing.push(field);
      map.set(field.section, existing);
    }
    return map;
  }, [fields]);

  // Compute changes
  const changes: FieldChanges = useMemo(() => {
    const result: FieldChanges = {};
    for (const field of fields) {
      const edited = editedValues[field.name];
      if (edited !== undefined && edited !== "") {
        const oldVal = field.currentValue;
        let newVal: string | number | boolean | null;
        if (field.type === "number") {
          newVal = edited === "" ? null : Number(edited);
        } else if (field.type === "boolean") {
          newVal = edited === "true";
        } else {
          newVal = edited;
        }
        // Only include if actually changed
        if (String(newVal) !== String(oldVal)) {
          result[field.name] = { old: oldVal, new: newVal };
        }
      }
    }
    return result;
  }, [editedValues, fields]);

  const changedCount = Object.keys(changes).length;
  const summaryValid = editSummary.trim().length >= 25;
  const canSubmit = changedCount > 0 && summaryValid && sourceType && !isSubmitting;

  const handleFieldChange = useCallback((fieldName: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const body = {
        entity_type: entityType,
        entity_id: entityId,
        entity_version: entityVersion,
        changes,
        edit_summary: editSummary.trim(),
        source_type: sourceType,
        ...(sourceUrl ? { source_url: sourceUrl } : {}),
        ...(sourceDate ? { source_date: sourceDate } : {}),
      };

      const res = await fetch("/api/v1/contributions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error?.message ?? `Submission failed (${res.status})`);
      }

      setSubmitted(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    getToken,
    entityType,
    entityId,
    entityVersion,
    changes,
    editSummary,
    sourceType,
    sourceUrl,
    sourceDate,
    onSuccess,
  ]);

  const handleReset = useCallback(() => {
    setEditedValues({});
    setSourceType("utility_website");
    setSourceUrl("");
    setSourceDate("");
    setEditSummary("");
    setError(null);
    setSubmitted(false);
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close edit panel"
        className="fixed inset-0 z-40 bg-black/30 transition-opacity border-0 cursor-default"
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter") handleClose();
        }}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] bg-background-surface border-l border-border-default shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div className="flex items-center gap-2">
            <Icon name="PencilSimple" size={18} className="text-brand-primary" />
            <span className="text-base font-semibold text-text-heading">Suggest Edit</span>
          </div>
          <Button variant="icon" onPress={handleClose} aria-label="Close">
            <Icon name="X" size={18} />
          </Button>
        </div>

        {/* Success state */}
        {submitted ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Icon name="Check" size={24} className="text-green-600" />
            </div>
            <div>
              <div className="text-lg font-semibold text-text-heading mb-1">Edit Submitted</div>
              <p className="text-sm text-text-muted">
                Your suggested edit for <strong>{entityName}</strong> has been submitted for review.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onPress={handleClose}>
                Close
              </Button>
              <Button variant="brand" href="/contributions">
                View My Contributions
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Entity info */}
              <div className="text-sm text-text-muted">
                Editing <strong className="text-text-heading">{entityName}</strong>
                <span className="ml-1 text-xs">({entitySlug})</span>
              </div>

              {/* Source citation bar */}
              <div className="bg-background-muted rounded-lg p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-text-muted">Source Citation</div>
                <Select
                  label="Source Type"
                  selectedKey={sourceType}
                  onSelectionChange={(key) => setSourceType(String(key))}
                  items={SOURCE_TYPES.map((st) => ({ id: st.id, label: st.label, value: st.id }))}
                  renderItem={(item) => item.label}
                  size="sm"
                />
                <TextField
                  label="Source URL"
                  placeholder="https://..."
                  value={sourceUrl}
                  onChange={(v) => setSourceUrl(v)}
                  size="sm"
                />
                <TextField
                  label="Source Date"
                  placeholder="YYYY-MM-DD"
                  value={sourceDate}
                  onChange={(v) => setSourceDate(v)}
                  size="sm"
                />
              </div>

              {/* Field-by-field editing */}
              {Array.from(sections.entries()).map(([sectionName, sectionFields]) => (
                <div key={sectionName}>
                  <div className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">
                    {sectionName}
                  </div>
                  <div className="space-y-3">
                    {sectionFields.map((field) => {
                      const editedVal = editedValues[field.name] ?? "";
                      const isChanged = field.name in changes;

                      return (
                        <div
                          key={field.name}
                          className={`rounded-lg p-3 transition-colors ${
                            isChanged
                              ? "border-l-2 border-l-brand-primary bg-blue-50/50"
                              : "border-l-2 border-l-transparent"
                          }`}
                        >
                          {isChanged && field.currentValue != null && (
                            <div className="text-xs text-text-muted mb-1">
                              <span className="line-through">{String(field.currentValue)}</span>
                            </div>
                          )}
                          {field.type === "number" ? (
                            <TextField
                              label={field.label}
                              placeholder={field.currentValue != null ? String(field.currentValue) : "—"}
                              value={editedVal}
                              onChange={(v) => handleFieldChange(field.name, v)}
                              size="sm"
                            />
                          ) : field.type === "url" ? (
                            <TextField
                              label={field.label}
                              placeholder={field.currentValue != null ? String(field.currentValue) : "https://..."}
                              value={editedVal}
                              onChange={(v) => handleFieldChange(field.name, v)}
                              size="sm"
                            />
                          ) : (
                            <TextField
                              label={field.label}
                              placeholder={field.currentValue != null ? String(field.currentValue) : "—"}
                              value={editedVal}
                              onChange={(v) => handleFieldChange(field.name, v)}
                              size="sm"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Edit summary */}
              <div>
                <TextArea
                  label="Edit Summary"
                  description={`${editSummary.trim().length}/25 characters minimum`}
                  placeholder="Describe what you changed and why (min 25 chars)..."
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  isInvalid={editSummary.length > 0 && !summaryValid}
                  errorMessage="Edit summary must be at least 25 characters"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border-default px-5 py-4 flex items-center justify-between">
              <div className="text-xs text-text-muted">
                {changedCount > 0 ? (
                  <span className="text-brand-primary font-medium">
                    {changedCount} field{changedCount !== 1 ? "s" : ""} changed
                  </span>
                ) : (
                  "No changes yet"
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onPress={handleClose} size="sm">
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  onPress={handleSubmit}
                  isDisabled={!canSubmit}
                  isLoading={isSubmitting}
                  size="sm"
                >
                  Submit for Review
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
