"use client";

/**
 * Slide-over host for the Suggest Edit flow inside an Explore detail panel.
 *
 * Wraps a panel's own content and, when editing, slides the edit pane in from
 * the right on top of it. Both layers stay mounted so the entity view keeps its
 * scroll position and the transition has something to slide against — a panel
 * that unmounted its content would flash empty mid-animation.
 *
 * Motion is suppressed under `prefers-reduced-motion` by the CSS.
 */

import { Icon } from "@texturehq/edges";
import { useEffect, useRef, useState } from "react";
import { InlineEditPane } from "@/components/contributions/InlineEditPane";

export interface PanelEditLayerProps {
  entityType: string;
  entityId: string | null;
  entityName: string;
  currentValues: Record<string, unknown> | null;
  isEditing: boolean;
  onCloseEdit: () => void;
  children: React.ReactNode;
}

export function PanelEditLayer({
  entityType,
  entityId,
  entityName,
  currentValues,
  isEditing,
  onCloseEdit,
  children,
}: PanelEditLayerProps) {
  const [submitted, setSubmitted] = useState(false);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The banner is a transient acknowledgement, not a permanent part of the
  // panel; it clears itself so a contributor who edits twice doesn't stack
  // notices. Cleared on unmount so the timer can't fire into a dead component.
  useEffect(() => {
    if (!submitted) return;
    dismissRef.current = setTimeout(() => setSubmitted(false), 6000);
    return () => {
      if (dismissRef.current) clearTimeout(dismissRef.current);
    };
  }, [submitted]);

  const canEdit = isEditing && entityId !== null && currentValues !== null;

  return (
    <div className="cg-panel-edit-layer">
      <div className="cg-panel-edit-base" aria-hidden={canEdit} inert={canEdit}>
        {submitted && (
          <div className="cg-panel-edit-banner" role="status">
            <Icon name="CheckCircle" size="sm" />
            <span className="flex-1">Edit submitted for review.</span>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              aria-label="Dismiss"
              className="cg-panel-edit-banner-x"
            >
              <Icon name="X" size={14} />
            </button>
          </div>
        )}
        {children}
      </div>

      <div className={`cg-panel-edit-slide ${canEdit ? "is-open" : ""}`} aria-hidden={!canEdit}>
        {canEdit && (
          <InlineEditPane
            entityType={entityType}
            entityId={entityId}
            entityName={entityName}
            currentValues={currentValues}
            onClose={onCloseEdit}
            onSubmitted={() => {
              setSubmitted(true);
              onCloseEdit();
            }}
          />
        )}
      </div>
    </div>
  );
}
