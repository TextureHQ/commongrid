"use client";

import { useState } from "react";
import { apiSegmentFor } from "@/lib/entity-routes";
import { VersionHistory } from "./VersionHistory";
import { VersionHistoryButton } from "./VersionHistoryButton";

interface EntityVersionHistoryProps {
  /** entity_type as stored in entity_versions, e.g. "power_plant". */
  entityType: string;
  entitySlug: string;
}

/**
 * "History" button plus its panel, with the open/closed state owned here so
 * callers add one element rather than repeating a useState in every detail
 * surface.
 *
 * Renders nothing for types with no slug-addressed versions endpoint —
 * `territory` and `transmission_line` are keyed by id — so a control that
 * could only 404 never appears.
 *
 * Available to anonymous visitors, unlike edit and delete: auditing how a
 * value got there is the point of publishing the data.
 */
export function EntityVersionHistory({ entityType, entitySlug }: EntityVersionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!apiSegmentFor(entityType)) return null;

  return (
    <>
      <VersionHistoryButton onClick={() => setIsOpen(true)} />
      <VersionHistory
        entityType={entityType}
        entitySlug={entitySlug}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
