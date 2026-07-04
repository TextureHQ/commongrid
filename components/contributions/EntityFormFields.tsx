"use client";

import { Badge } from "@texturehq/edges";

export interface EditableField {
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

interface EntityFormFieldsProps {
  fields: EditableField[];
  formValues: Record<string, unknown>;
  onChange: (fieldName: string, value: unknown) => void;
  /** Optional: for create forms, show all fields. For edit, show only changed fields */
  mode?: "create" | "edit";
}

export function EntityFormFields({ fields, formValues, onChange, mode = "edit" }: EntityFormFieldsProps) {
  return (
    <div className="space-y-4">
      {mode === "create" && <h3 className="text-sm font-semibold text-text-heading">Entity Information</h3>}
      {mode === "edit" && <h3 className="text-sm font-semibold text-text-heading">Fields</h3>}
      {fields.map((field) => (
        <div key={field.fieldName} className="space-y-1">
          <label htmlFor={field.fieldName} className="flex items-center gap-2 text-sm font-medium text-text-body">
            {field.displayName}
            {field.isCritical && (
              <Badge variant="warning" size="sm">
                Critical
              </Badge>
            )}
          </label>
          {renderFieldInput(field, formValues[field.fieldName], onChange)}
        </div>
      ))}
    </div>
  );
}

interface SourceCitationFieldsProps {
  sourceType: string;
  sourceUrl: string;
  sourceDate: string;
  onSourceTypeChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onSourceDateChange: (value: string) => void;
}

export const SOURCE_TYPE_OPTIONS = [
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

export function SourceCitationFields({
  sourceType,
  sourceUrl,
  sourceDate,
  onSourceTypeChange,
  onSourceUrlChange,
  onSourceDateChange,
}: SourceCitationFieldsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-heading">Source Citation</h3>

      <div className="space-y-1">
        <label htmlFor="sourceType" className="text-sm font-medium text-text-body">
          Source Type
        </label>
        <select
          id="sourceType"
          value={sourceType}
          onChange={(e) => onSourceTypeChange(e.target.value)}
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
        <label htmlFor="sourceUrl" className="text-sm font-medium text-text-body">
          Source URL (optional)
        </label>
        <input
          id="sourceUrl"
          type="url"
          value={sourceUrl}
          onChange={(e) => onSourceUrlChange(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-disabled placeholder:opacity-60 focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="sourceDate" className="text-sm font-medium text-text-body">
          Source Date (optional)
        </label>
        <input
          id="sourceDate"
          type="date"
          value={sourceDate}
          onChange={(e) => onSourceDateChange(e.target.value)}
          className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        />
      </div>
    </div>
  );
}

interface EditSummaryFieldProps {
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
  placeholder?: string;
}

export function EditSummaryField({ value, onChange, minLength = 10, placeholder }: EditSummaryFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="editSummary" className="flex items-center justify-between text-sm font-medium text-text-body">
        <span>
          Edit Summary <span className="text-feedback-error">*</span>
        </span>
        <span className={`text-xs ${value.trim().length >= minLength ? "text-feedback-success" : "text-text-muted"}`}>
          {value.trim().length}/{minLength}
        </span>
      </label>
      <textarea
        id="editSummary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `Describe the changes you're making (minimum ${minLength} characters)`}
        rows={3}
        className="w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-disabled placeholder:opacity-60 focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
      />
      <p className="text-xs text-text-muted">A short description helps reviewers verify your update.</p>
    </div>
  );
}

/**
 * Render the appropriate input field based on field type
 */
function renderFieldInput(field: EditableField, value: unknown, onChange: (fieldName: string, value: unknown) => void) {
  const inputClassName =
    "w-full rounded-md border border-border-default bg-background-body px-3 py-2 text-sm text-text-body placeholder:text-text-disabled placeholder:opacity-60 focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20";

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
          onChange={(e) => onChange(field.fieldName, e.target.value ? parseInt(e.target.value, 10) : null)}
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
          onChange={(e) => onChange(field.fieldName, e.target.value ? parseFloat(e.target.value) : null)}
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
