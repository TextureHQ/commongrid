"use client";

import { useAuth } from "@clerk/nextjs";
import { Button, Tooltip } from "@texturehq/edges";

interface SuggestEditButtonProps {
  onClick: () => void;
}

/**
 * "Suggest Edit" button for entity detail pages.
 * Grayed out for anonymous users with sign-in tooltip.
 */
export function SuggestEditButton({ onClick }: SuggestEditButtonProps) {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <Tooltip content="Sign in to suggest edits">
        <Button variant="secondary" icon="PencilSimple" size="sm" isDisabled>
          Suggest Edit
        </Button>
      </Tooltip>
    );
  }

  return (
    <Button variant="secondary" icon="PencilSimple" size="sm" onPress={onClick}>
      Suggest Edit
    </Button>
  );
}
