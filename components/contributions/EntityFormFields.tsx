"use client";

import {
  Badge,
  Checkbox,
  CheckboxGroup,
  DateField,
  Icon,
  NumberField,
  Select,
  Switch,
  TextArea,
  TextField,
} from "@texturehq/edges";
import { useState } from "react";
import { fromCalendarDate, toCalendarDate } from "@/lib/forms/date-value";
import { EDIT_SUMMARY_MIN_LENGTH } from "@/lib/mod/apply-contribution";
import {
  AssetTypeLabel,
  DeviceTypeLabel,
  GridServiceLabel,
  IncentiveStructureLabel,
  MarketSegmentLabel,
  ParticipationModelLabel,
} from "@/types/programs";

export interface EditableField {
  fieldName: string;
  fieldType: "text" | "integer" | "float" | "boolean" | "enum" | "multi_enum" | "url";
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

// Human-readable labels for the enum options rendered by the select /
// multi-select controls. Sourced from types/programs.ts so the labels can
// never drift from the canonical enum members.
const ENUM_LABEL_OVERRIDES: Record<string, string> = {
  ...AssetTypeLabel,
  ...DeviceTypeLabel,
  ...MarketSegmentLabel,
  ...ParticipationModelLabel,
  ...GridServiceLabel,
  ...IncentiveStructureLabel,
};

function humanizeOptionLabel(value: string): string {
  return ENUM_LABEL_OVERRIDES[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Multi-select control for `multi_enum` fields (JSONB enum arrays such as
 * asset_types, market_segments, grid_services). Emits a string[] of the
 * selected enum members, preserving the canonical option order.
 *
 * Collapsed until opened. A program has six of these totalling 48 options, and
 * every option is a react-aria Checkbox carrying its own focus, label and
 * validation wiring — mounting them all up front was most of the delay behind
 * the panel's loading spinner. Collapsed, the form mounts ~22 controls instead
 * of 70, and a group costs nothing until a contributor actually opens it.
 */
function MultiSelectFieldInput({
  field,
  value,
  onChange,
}: {
  field: EditableField;
  value: unknown;
  onChange: (fieldName: string, value: unknown) => void;
}) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const options = field.validationRules?.enum ?? [];
  // Open on mount when something is already selected, so an existing value is
  // never hidden behind a collapsed summary the contributor has to think to open.
  const [isOpen, setIsOpen] = useState(selected.length > 0);

  if (!isOpen) {
    return (
      <div className="space-y-1">
        <span className="text-sm font-medium text-text-body">{field.displayName}</span>
        <button type="button" onClick={() => setIsOpen(true)} className="cg-multiselect-summary">
          <span className="flex-1 text-left">
            {selected.length === 0 ? `Select ${options.length} options` : selected.map(humanizeOptionLabel).join(", ")}
          </span>
          <Icon name="CaretDown" size="sm" />
        </button>
      </div>
    );
  }

  return (
    <CheckboxGroup
      label={field.displayName}
      value={selected}
      // CheckboxGroup hands back the selected values in click order; reorder to
      // the canonical option order so the emitted array is stable no matter how
      // the user got there.
      onChange={(next) =>
        onChange(
          field.fieldName,
          options.filter((item) => next.includes(item))
        )
      }
      description="Select one or more values."
    >
      <div className="grid gap-2 rounded-md border border-border-default bg-background-body p-3 sm:grid-cols-2">
        {options.map((option) => (
          <Checkbox key={option} value={option}>
            {humanizeOptionLabel(option)}
          </Checkbox>
        ))}
      </div>
    </CheckboxGroup>
  );
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
        // The Edges field renders its own <label>, so the "Critical" badge sits
        // beside the control rather than inside a second label element — two
        // labels for one input is what produced the doubled focus treatment.
        <div key={field.fieldName} className="space-y-1">
          {field.isCritical && (
            <div className="flex justify-end">
              <Badge variant="warning" size="sm">
                Critical
              </Badge>
            </div>
          )}
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

      <Select
        label="Source Type"
        selectedKey={sourceType}
        onSelectionChange={(key) => onSourceTypeChange(String(key))}
        items={SOURCE_TYPE_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label, value: opt.value }))}
        renderItem={(item) => item.label}
      />

      <TextField
        label="Source URL (optional)"
        type="url"
        value={sourceUrl}
        onChange={onSourceUrlChange}
        placeholder="https://..."
      />

      <DateField
        label="Source Date (optional)"
        value={toCalendarDate(sourceDate)}
        onChange={(date) => onSourceDateChange(fromCalendarDate(date))}
      />
    </div>
  );
}

interface EditSummaryFieldProps {
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
  placeholder?: string;
}

export function EditSummaryField({
  value,
  onChange,
  minLength = EDIT_SUMMARY_MIN_LENGTH,
  placeholder,
}: EditSummaryFieldProps) {
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
      <TextArea
        id="editSummary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `Describe the changes you're making (minimum ${minLength} characters)`}
        rows={3}
        description="A short description helps reviewers verify your update."
      />
    </div>
  );
}

/**
 * Render the appropriate input field based on field type
 */
function renderFieldInput(field: EditableField, value: unknown, onChange: (fieldName: string, value: unknown) => void) {
  switch (field.fieldType) {
    case "text":
      return (
        <TextField
          id={field.fieldName}
          label={field.displayName}
          value={(value as string) ?? ""}
          onChange={(next) => onChange(field.fieldName, next)}
        />
      );

    case "url":
      return (
        <TextField
          id={field.fieldName}
          label={field.displayName}
          type="url"
          value={(value as string) ?? ""}
          onChange={(next) => onChange(field.fieldName, next)}
          placeholder="https://..."
        />
      );

    case "integer":
    case "float":
      return (
        <NumberField
          id={field.fieldName}
          label={field.displayName}
          // NumberField emits NaN when cleared; store null so an emptied field
          // round-trips as "no value" rather than a NaN that fails validation.
          value={typeof value === "number" ? value : Number.NaN}
          onChange={(next) => onChange(field.fieldName, Number.isNaN(next) ? null : next)}
          minValue={field.validationRules?.min}
          maxValue={field.validationRules?.max}
          step={field.fieldType === "integer" ? 1 : undefined}
          formatOptions={field.fieldType === "integer" ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 20 }}
        />
      );

    case "boolean":
      return (
        <Switch isSelected={(value as boolean) ?? false} onChange={(next) => onChange(field.fieldName, next)}>
          {field.displayName}
        </Switch>
      );

    case "multi_enum":
      return <MultiSelectFieldInput field={field} value={value} onChange={onChange} />;

    case "enum":
      return (
        <Select
          label={field.displayName}
          selectedKey={(value as string) || undefined}
          onSelectionChange={(key) => onChange(field.fieldName, key ? String(key) : "")}
          items={(field.validationRules?.enum ?? []).map((option) => ({
            id: option,
            label: humanizeOptionLabel(option),
            value: option,
          }))}
          renderItem={(item) => item.label}
          placeholder="-- Select --"
        />
      );

    default:
      return (
        <TextField
          id={field.fieldName}
          label={field.displayName}
          value={(value as string) ?? ""}
          onChange={(next) => onChange(field.fieldName, next)}
        />
      );
  }
}
