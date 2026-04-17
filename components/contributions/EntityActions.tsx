"use client";

import { useState } from "react";
import { type EditableField, EditPanel } from "./EditPanel";
import { SuggestEditButton } from "./SuggestEditButton";
import { VersionHistory } from "./VersionHistory";
import { VersionHistoryButton } from "./VersionHistoryButton";

interface EntityActionsProps {
  entityType: string;
  entityId: string;
  entitySlug: string;
  entityVersion: number;
  entityName: string;
  editableFields: EditableField[];
  /** URL-friendly entity type plural for the versions API, e.g. "power-plant" → used to build /api/v1/{type}s/{slug}/versions */
  versionApiEntityType?: string;
}

/**
 * Combined Suggest Edit + Version History buttons for entity detail pages.
 * Renders both buttons and manages the slide-over panel state.
 */
export function EntityActions({
  entityType,
  entityId,
  entitySlug,
  entityVersion,
  entityName,
  editableFields,
  versionApiEntityType,
}: EntityActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <SuggestEditButton onClick={() => setEditOpen(true)} />
        <VersionHistoryButton onClick={() => setHistoryOpen(true)} />
      </div>

      <EditPanel
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        entityType={entityType}
        entityId={entityId}
        entitySlug={entitySlug}
        entityVersion={entityVersion}
        entityName={entityName}
        fields={editableFields}
      />

      <VersionHistory
        entityType={versionApiEntityType ?? entityType}
        entitySlug={entitySlug}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}
