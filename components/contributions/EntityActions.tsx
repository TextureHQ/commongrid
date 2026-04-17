"use client";

import { Button, Icon, Tooltip } from "@texturehq/edges";
import { useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { EditEntityPanel } from "./EditEntityPanel";

interface EntityActionsProps {
  entityType: string;
  entityId: string;
  entitySlug: string;
  entityName: string;
  currentValues: Record<string, unknown>;
}

/**
 * EntityActions
 *
 * Action buttons for entity detail pages, including "Suggest Edit".
 * Disabled for anonymous users with a tooltip prompt to sign in.
 */
export function EntityActions({ entityType, entityId, entitySlug, entityName, currentValues }: EntityActionsProps) {
  const { user, isLoading } = useCurrentUser();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const isSignedIn = !!user;

  const handleOpenPanel = () => {
    if (isSignedIn) {
      setIsPanelOpen(true);
    }
  };

  const editButton = (
    <Button
      variant="secondary"
      size="md"
      onPress={handleOpenPanel}
      isDisabled={!isSignedIn || isLoading}
      className="gap-2"
    >
      <Icon name="PencilSimple" size="sm" />
      <span>Suggest Edit</span>
    </Button>
  );

  return (
    <>
      {!isSignedIn && !isLoading ? (
        <Tooltip content="Sign in to suggest edits" placement="bottom">
          {editButton}
        </Tooltip>
      ) : (
        editButton
      )}

      {isPanelOpen && (
        <EditEntityPanel
          entityType={entityType}
          entityId={entityId}
          entitySlug={entitySlug}
          entityName={entityName}
          currentValues={currentValues}
          onClose={() => setIsPanelOpen(false)}
          onSubmitted={() => {
            setIsPanelOpen(false);
            // Optionally trigger a page refresh or refetch
          }}
        />
      )}
    </>
  );
}
