"use client";

import { SignInButton } from "@clerk/nextjs";
import { Button, Dialog, Icon, Tooltip } from "@texturehq/edges";
import { useEffect, useState } from "react";
import { InlineFieldEdit } from "@/components/contributions/InlineFieldEdit";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * Individual field item with label and value
 */
export interface FieldItem {
  id: string;
  label: React.ReactNode;
  value: React.ReactNode;
  /** If true, shows a copy button */
  copyable?: boolean;
  /** If provided, wraps value in a link */
  href?: string;
  /** If true, field can be edited inline */
  editable?: boolean;
  /** Database field name for editing */
  fieldName?: string;
}

/**
 * FieldList - Display label-value pairs in 1 or 2 column layout
 *
 * Supports copyable fields, linked values, and inline editing.
 * Mobile-first responsive design.
 */
interface FieldListProps {
  /** Array of field items to display */
  items: FieldItem[];
  /** Layout: 1 column or 2 columns (responsive) */
  columns?: 1 | 2;
  /** Enable inline field editing */
  enableInlineEdit?: boolean;
  /** Entity type for editing */
  entityType?: string;
  /** Entity ID for editing */
  entityId?: string;
  /** Entity name for editing */
  entityName?: string;
  /** Current entity values */
  currentValues?: Record<string, unknown>;
  /** Callback when field is edited */
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
    <button
      type="button"
      onClick={handleCopy}
      className="text-text-muted hover:text-text-body text-xs opacity-0 group-hover:opacity-100 transition-opacity"
      aria-label="Copy to clipboard"
    >
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
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(hasTouch);
  }, []);

  if (item.value === null || item.value === undefined) {
    return <span className="text-text-muted">—</span>;
  }

  const content = item.href ? (
    <a
      href={item.href}
      target={item.href.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="text-text-body hover:underline"
    >
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: span provides hover context for child buttons */}
      <span
        className="flex items-center gap-2 group"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsHovering(true)}
        onBlur={() => setIsHovering(false)}
      >
        {content}
        {item.copyable && typeof item.value === "string" && <CopyButton value={item.value} />}
        {canEdit &&
          (isTouchDevice || isHovering) &&
          (isTouchDevice ? (
            <button
              type="button"
              onClick={handleEditClick}
              className="text-text-muted hover:text-text-body transition-colors"
              aria-label={`Edit ${item.label}`}
            >
              <Icon name="PencilSimple" size="xs" />
            </button>
          ) : (
            <Tooltip content="Edit this field" placement="top">
              <button
                type="button"
                onClick={handleEditClick}
                className="text-text-muted hover:text-text-body opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Edit ${item.label}`}
              >
                <Icon name="PencilSimple" size="xs" />
              </button>
            </Tooltip>
          ))}
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

      <Dialog isOpen={showSignInModal} onClose={() => setShowSignInModal(false)} title="Sign in to edit">
        <div className="space-y-4 p-4">
          <p className="text-sm text-text-body">Sign in to suggest edits and help improve CommonGrid data quality.</p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onPress={() => setShowSignInModal(false)}>
              Cancel
            </Button>
            <SignInButton mode="modal">
              <Button variant="primary">Sign In</Button>
            </SignInButton>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function FieldList({
  items,
  columns = 1,
  enableInlineEdit,
  entityType,
  entityId,
  entityName,
  currentValues,
  onFieldEdited,
}: FieldListProps) {
  const filtered = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");

  if (filtered.length === 0) return null;

  const containerClass = columns === 2 ? "grid md:grid-cols-2 gap-x-8 gap-y-4" : "space-y-4";

  return (
    <div className={containerClass}>
      {filtered.map((item) => (
        <div key={item.id} className="flex flex-col gap-1">
          <div className="text-label-sm uppercase tracking-wide font-medium text-text-caption">{item.label}</div>
          <div className="text-body-md text-text-body">
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
