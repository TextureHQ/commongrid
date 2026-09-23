"use client";

import { Badge } from "@texturehq/edges";
import { useEffect, useMemo, useState } from "react";
import { versionsPath } from "@/lib/entity-routes";

interface EntityProvenanceBadgesProps {
  entityType: string;
  entitySlug: string;
  sourceLabel?: string | null;
}

function prettifySourceLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const tail = trimmed.split("/").pop() ?? trimmed;
  const withoutExt = tail.replace(/\.(json|csv|tsv|geojson|yaml|yml|md)$/i, "");
  const spaced = withoutExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  return spaced
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (word === word.toUpperCase()) return word;
      if (word.length <= 3) return word.toUpperCase();
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function EntityProvenanceBadges({ entityType, entitySlug, sourceLabel }: EntityProvenanceBadgesProps) {
  const [latestSourceType, setLatestSourceType] = useState<string | null>(null);
  const [didLoad, setDidLoad] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLatestSourceType(null);
    setDidLoad(false);

    const path = versionsPath(entityType, entitySlug);
    if (!path) {
      setDidLoad(true);
      return () => {
        cancelled = true;
      };
    }

    void fetch(path)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load versions (${res.status})`);
        return (await res.json()) as { data?: Array<{ versionNumber: number; sourceType?: string | null }> };
      })
      .then((json) => {
        if (cancelled) return;
        const versions = json.data ?? [];
        const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
        const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
        setLatestSourceType(latest?.sourceType ?? null);
      })
      .catch(() => {
        if (!cancelled) setLatestSourceType(null);
      })
      .finally(() => {
        if (!cancelled) setDidLoad(true);
      });

    return () => {
      cancelled = true;
    };
  }, [entitySlug, entityType]);

  const badge = useMemo(() => {
    const normalizedSourceType = latestSourceType?.trim().toLowerCase() ?? null;
    const source = sourceLabel?.trim() ? prettifySourceLabel(sourceLabel) : null;
    const sourceType = normalizedSourceType ? prettifySourceLabel(normalizedSourceType) : null;
    const isHuman =
      normalizedSourceType === "community" ||
      normalizedSourceType === "community_override" ||
      normalizedSourceType === "admin";

    if (isHuman) {
      return { label: "Community-verified", variant: "success" as const };
    }

    if (source) {
      return { label: `Sourced: ${source}`, variant: "info" as const };
    }

    if (sourceType) {
      return { label: `Sourced: ${sourceType}`, variant: "info" as const };
    }

    if (didLoad) {
      return { label: "Needs verification / help us fill this in", variant: "warning" as const };
    }

    return null;
  }, [didLoad, latestSourceType, sourceLabel]);

  if (!badge) return null;

  return (
    <Badge size="sm" shape="pill" variant={badge.variant}>
      {badge.label}
    </Badge>
  );
}
