"use client";

import { Dialog, Icon } from "@texturehq/edges";
import { useState } from "react";

interface DeleteEntityDialogProps {
  entityType: string;
  entityId: string;
  entityName: string;
  entityVersion: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DELETION_REASONS = [
  { value: "duplicate", label: "Duplicate entry" },
  { value: "no_longer_exists", label: "Entity no longer exists" },
  { value: "data_quality", label: "Data quality / incorrect entry" },
  { value: "merged", label: "Merged into another entity" },
  { value: "other", label: "Other" },
];

const SOURCE_TYPES = [
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

export function DeleteEntityDialog({
  entityType,
  entityId,
  entityName,
  entityVersion,
  isOpen,
  onClose,
  onSuccess,
}: DeleteEntityDialogProps) {
  const [reason, setReason] = useState("duplicate");
  const [justification, setJustification] = useState("");
  const [duplicateOf, setDuplicateOf] = useState("");
  const [sourceType, setSourceType] = useState("utility_website");
  const [sourceUrl, setSourceUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDuplicateReason = reason === "duplicate";
  const isValid = justification.trim().length >= 50 && sourceUrl.trim().length > 0;

  const inputClassName =
    "w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20";

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const deletionData: Record<string, unknown> = {
        reason,
        justification: justification.trim(),
      };

      if (isDuplicateReason && duplicateOf.trim()) {
        deletionData.duplicateOf = duplicateOf.trim();
      }

      const payload = {
        entity_type: entityType,
        entity_id: entityId,
        entity_version: entityVersion,
        change_type: "delete",
        edit_summary: `Deletion request: ${justification.trim().slice(0, 100)}`,
        source_type: sourceType,
        source_url: sourceUrl.trim(),
        changes: { _deletion: deletionData },
      };

      const response = await fetch("/api/v1/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || `Request failed: ${response.statusText}`);
      }

      onSuccess();
    } catch (err) {
      console.error("Error submitting deletion request:", err);
      setError(err instanceof Error ? err.message : "Failed to submit deletion request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Request Deletion"
      secondaryAction={{ label: "Cancel", onPress: onClose, isDisabled: isSubmitting }}
      primaryAction={{
        label: "Submit Deletion Request",
        onPress: handleSubmit,
        variant: "destructive",
        isDisabled: !isValid || isSubmitting,
        isLoading: isSubmitting,
      }}
    >
      <div className="space-y-4">
        {/* Entity info */}
        <div className="p-3 rounded-lg bg-background-muted border border-border-default">
          <div className="flex items-start gap-2">
            <Icon name="Warning" size={16} className="text-feedback-warning mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-text-heading">
                Requesting deletion of: <span className="font-semibold">{entityName}</span>
              </div>
              <div className="text-xs text-text-muted mt-1">
                Entity Type: {entityType.replace(/_/g, " ")} • ID: {entityId.slice(0, 12)}…
              </div>
            </div>
          </div>
        </div>

        {/* Deletion reason */}
        <div className="space-y-1">
          <label htmlFor="deletionReason" className="text-sm font-medium text-text-body">
            Deletion Reason <span className="text-feedback-error">*</span>
          </label>
          <select
            id="deletionReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClassName}
          >
            {DELETION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Duplicate entity field */}
        {isDuplicateReason && (
          <div className="space-y-1">
            <label htmlFor="duplicateOf" className="text-sm font-medium text-text-body">
              Duplicate Of (Entity ID or Slug)
            </label>
            <input
              id="duplicateOf"
              type="text"
              value={duplicateOf}
              onChange={(e) => setDuplicateOf(e.target.value)}
              placeholder="e.g., pacific-gas-electric"
              className={inputClassName}
            />
            <p className="text-xs text-text-muted">Specify which entity this is a duplicate of</p>
          </div>
        )}

        {/* Justification */}
        <div className="space-y-1">
          <label
            htmlFor="justification"
            className="flex items-center justify-between text-sm font-medium text-text-body"
          >
            <span>
              Justification <span className="text-feedback-error">*</span>
            </span>
            <span
              className={`text-xs ${justification.trim().length >= 50 ? "text-feedback-success" : "text-text-muted"}`}
            >
              {justification.trim().length}/50
            </span>
          </label>
          <textarea
            id="justification"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Provide detailed justification for why this entity should be deleted (minimum 50 characters)..."
            rows={4}
            className={inputClassName}
          />
        </div>

        {/* Source citation */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="deleteSourceType" className="text-sm font-medium text-text-body">
              Source Type <span className="text-feedback-error">*</span>
            </label>
            <select
              id="deleteSourceType"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className={inputClassName}
            >
              {SOURCE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="deleteSourceUrl" className="text-sm font-medium text-text-body">
              Source URL <span className="text-feedback-error">*</span>
            </label>
            <input
              id="deleteSourceUrl"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className={inputClassName}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-lg bg-feedback-error/10 border border-feedback-error text-feedback-error text-sm">
            <div className="flex items-start gap-2">
              <Icon name="Warning" size={16} className="mt-0.5" />
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Info notice */}
        <div className="p-3 rounded-lg bg-background-muted text-text-muted text-xs">
          Deletion requests require moderation review. Admins can approve deletions immediately, but all other deletions
          must be reviewed by a moderator to ensure data integrity.
        </div>
      </div>
    </Dialog>
  );
}
