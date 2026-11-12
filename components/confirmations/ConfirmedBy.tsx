"use client";

import { useEffect, useRef, useState } from "react";
import { confirmationFor, confirmedLine, type PublicConfirmation } from "@/lib/confirmations/record";

export interface UtilityConfirmations {
  confirmedBy: string;
  confirmations: PublicConfirmation[];
}

type Field = Parameters<typeof confirmationFor>[1];

/**
 * The public confirmations for one utility and the programs it runs. Null
 * until loaded, and on any failure: the line is an extra, so the page simply
 * shows nothing rather than an error.
 *
 * Change `refreshKey` to load again, past the browser's cached copy: used
 * right after someone confirms, so their own line shows without a reload.
 */
export function useUtilityConfirmations(
  utilitySlug: string | null | undefined,
  refreshKey = 0
): UtilityConfirmations | null {
  const [data, setData] = useState<UtilityConfirmations | null>(null);
  const loadedSlug = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const isRefresh = loadedSlug.current === utilitySlug && refreshKey > 0;
    loadedSlug.current = utilitySlug;
    if (!isRefresh) setData(null);
    if (!utilitySlug) return;
    let cancelled = false;
    fetch(`/api/v1/utilities/${encodeURIComponent(utilitySlug)}/confirmations`, {
      cache: isRefresh ? "reload" : "default",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: UtilityConfirmations } | null) => {
        if (!cancelled && json?.data?.confirmations?.length) setData(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [utilitySlug, refreshKey]);

  return data;
}

/**
 * "Confirmed by {utility} staff · {date}" for one field, or null when that
 * field has no confirmation or `shownValue` isn't the value that was confirmed.
 * About this one field only; never the whole record.
 */
export function confirmedText(
  data: UtilityConfirmations | null,
  field: Field,
  shownValue: string | null | undefined
): string | null {
  if (!data) return null;
  const match = confirmationFor(data.confirmations, field, shownValue);
  return match
    ? confirmedLine(data.confirmedBy, match.confirmedAt, field.fieldName === "status" ? "status" : undefined)
    : null;
}

/**
 * For the Explore program panel: the status line from one utility that runs
 * the program. Renders nothing unless that utility's staff confirmed the
 * status the panel is showing.
 */
export function ProgramStatusConfirmed({
  utilitySlug,
  programSlug,
  status,
}: {
  utilitySlug: string;
  programSlug: string;
  status: string;
}) {
  const text = confirmedText(useUtilityConfirmations(utilitySlug), { fieldName: "status", programSlug }, status);
  return text ? <div className="mt-1 text-body-sm text-text-muted">{text}</div> : null;
}
