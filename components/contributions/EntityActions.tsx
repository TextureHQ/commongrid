"use client";

import { Button, Icon, Tooltip } from "@texturehq/edges";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { DeleteEntityDialog } from "./DeleteEntityDialog";
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
 * Action buttons for entity detail pages: "Suggest Edit" + "..." menu with
 * "Request Deletion". Disabled for anonymous users with a tooltip.
 */
export function EntityActions({ entityType, entityId, entitySlug, entityName, currentValues }: EntityActionsProps) {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Auto-open edit panel when ?edit=true is in the URL
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (didAutoOpen.current) return;
    if (searchParams.get("edit") === "true" && user && !isLoading) {
      didAutoOpen.current = true;
      setIsPanelOpen(true);
      // Clean up the URL param without navigation
      const url = new URL(window.location.href);
      url.searchParams.delete("edit");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, user, isLoading]);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isSignedIn = !!user;
  const entityVersion = (currentValues.version as number) ?? 1;

  const handleOpenPanel = () => {
    if (isSignedIn) setIsPanelOpen(true);
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
      <div className="flex items-center gap-2">
        {!isSignedIn && !isLoading ? (
          <Tooltip content="Sign in to suggest edits" placement="bottom">
            {editButton}
          </Tooltip>
        ) : (
          editButton
        )}

        {/* "..." menu */}
        {isSignedIn && (
          <div className="relative" ref={menuRef}>
            <Button
              variant="secondary"
              size="md"
              onPress={() => setMenuOpen((prev) => !prev)}
              aria-label="More actions"
            >
              <Icon name="DotsThree" size="sm" />
            </Button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-border-default bg-background-body shadow-lg py-1">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-feedback-error hover:bg-background-muted transition-colors"
                  onClick={() => {
                    setMenuOpen(false);
                    setIsDeleteOpen(true);
                  }}
                >
                  <Icon name="Trash" size="sm" />
                  Request Deletion
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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
            router.refresh();
          }}
        />
      )}

      {isDeleteOpen && (
        <DeleteEntityDialog
          entityType={entityType}
          entityId={entityId}
          entityName={entityName}
          entityVersion={entityVersion}
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          onSuccess={() => {
            setIsDeleteOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
