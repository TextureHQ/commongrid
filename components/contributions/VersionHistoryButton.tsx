"use client";

import { Button } from "@texturehq/edges";

interface VersionHistoryButtonProps {
  onClick: () => void;
}

/**
 * "History" clock icon button for entity detail pages.
 */
export function VersionHistoryButton({ onClick }: VersionHistoryButtonProps) {
  return (
    <Button variant="secondary" icon="ClockCounterClockwise" size="sm" onPress={onClick}>
      History
    </Button>
  );
}
