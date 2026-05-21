"use client";

import { SignInButton } from "@clerk/nextjs";
import { Icon, Tooltip } from "@texturehq/edges";
import { useEffect, useState } from "react";
import { InlineFieldEdit } from "@/components/contributions/InlineFieldEdit";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export interface FieldItem {
  id: string;
  label: string;
  value: React.ReactNode;
  /** If true, shows a copy button that copies the string value */
  copyable?: boolean;
  /** If provided, wraps the value in a link */
  href?: string;
  /** If true, this field can be edited inline */
  editable?: boolean;
  /** The database field name (snake_case) for inline editing */
  fieldName?: string;
}

interface DetailFieldListProps {
  items: FieldItem[];
  /** 1 = full-width rows, 2 = two-column grid */
  columns?: 1 | 2;
  /** Enable inline field editing */
  enableInlineEdit?: boolean;
  /** Entity type for inline editing */
  entityType?: string;
  /** Entity ID for inline editing */
  entityId?: string;
  /** Entity name for inline editing */
  entityName?: string;
  /** Current entity values for inline editing */
  currentValues?: Record<string, unknown>;
  /** Callback when a field is edited */
  onFieldEdited?: () => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button type="button" className="copy-btn" onClick={handleCopy} aria-label="Copy">
      {copied ? "✓ copied" : "copy"}
    </button>
  );
}

interface FieldValueProps {
  item: FieldItem;
  enableInlineEdit?: boolean;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  currentValues?: Record<string, unknown>;
  onFieldEdited?: () => void;
}

function FieldValue({
  item,
  enableInlineEdit,
  entityType,
  entityId,
  entityName,
  currentValues,
  onFieldEdited,
}: FieldValueProps) {
  const { user, isLoading } = useCurrentUser();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Detect touch capability
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(hasTouch);
  }, []);

  if (item.value === null || item.value === undefined) {
    return <span style={{ color: "var(--color-text-caption)" }}>—</span>;
  }

  const content = item.href ? (
    <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
      {item.value}
    </a>
  ) : (
    item.value
  );

  const canEdit = enableInlineEdit && item.editable && item.fieldName && entityType && entityId && entityName;

  const handleEditClick = () => {
    if (!user && !isLoading) {
      setShowSignInModal(true);
    } else if (user) {
      setShowEditModal(true);
    }
  };

  const currentVersion = (currentValues?.version as number) ?? 1;
  const currentValue = item.fieldName ? currentValues?.[item.fieldName] : item.value;

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: span provides hover context for child button */}
      <span
        className="inline-flex items-center gap-2"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsHovering(true)}
        onBlur={() => setIsHovering(false)}
      >
        {content}
        {item.copyable && typeof item.value === "string" && <CopyButton value={item.value} />}
        {canEdit && (isTouchDevice || isHovering) && (
          <Tooltip content="Edit this field" placement="top">
            <button
              type="button"
              onClick={handleEditClick}
              className="text-text-muted hover:text-text-body transition-colors"
              aria-label={`Edit ${item.label}`}
            >
              <Icon name="PencilSimple" size="xs" />
            </button>
          </Tooltip>
        )}
      </span>

      {showEditModal && canEdit && entityType && entityId && entityName && item.fieldName && (
        <InlineFieldEdit
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          entityType={entityType}
          entityId={entityId}
          entityName={entityName}
          fieldName={item.fieldName}
          currentValue={currentValue}
          currentVersion={currentVersion}
          onSubmitted={() => {
            setShowEditModal(false);
            onFieldEdited?.();
          }}
        />
      )}

      {showSignInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background-body rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-text-heading mb-2">Sign in to edit</h3>
            <p className="text-sm text-text-body mb-4">
              Sign in to suggest edits and help improve CommonGrid data quality.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSignInModal(false)}
                className="px-4 py-2 text-sm font-medium text-text-body hover:text-text-heading transition-colors"
              >
                Cancel
              </button>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium bg-brand-primary text-text-on-primary rounded-md hover:bg-brand-primary/90 transition-colors"
                >
                  Sign In
                </button>
              </SignInButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DetailFieldList({
  items,
  columns = 1,
  enableInlineEdit,
  entityType,
  entityId,
  entityName,
  currentValues,
  onFieldEdited,
}: DetailFieldListProps) {
  const filtered = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");

  if (filtered.length === 0) return null;

  const containerClass = columns === 2 ? "detail-fields-2col" : "detail-fields";

  return (
    <div className={containerClass}>
      {filtered.map((item) => (
        <div key={item.id} className="detail-field">
          <div className="detail-field-label">{item.label}</div>
          <div className="detail-field-value">
            <FieldValue
              item={item}
              enableInlineEdit={enableInlineEdit}
              entityType={entityType}
              entityId={entityId}
              entityName={entityName}
              currentValues={currentValues}
              onFieldEdited={onFieldEdited}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
