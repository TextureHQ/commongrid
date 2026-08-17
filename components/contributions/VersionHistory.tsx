"use client";

import { Badge, Button, Card, Icon, Loader, Timeline, TimelineItem } from "@texturehq/edges";
import { useCallback, useEffect, useState } from "react";
import { versionsPath } from "@/lib/entity-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionEntry {
  id: number;
  versionNumber: number;
  changeType: string;
  changeSummary: string | null;
  changedBy: string | null;
  changedAt: string;
  sourceType?: string | null;
  delta: Record<string, { old: unknown; new: unknown }> | null;
}

interface VersionHistoryProps {
  entityType: string;
  entitySlug: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceTypeBadge(sourceType: string | null | undefined) {
  if (!sourceType) return null;
  const variant = sourceType === "sync" ? "info" : sourceType === "community" ? "success" : "neutral";
  const label = sourceType === "sync" ? "EIA Sync" : sourceType === "community" ? "Community" : sourceType;
  return (
    <Badge size="sm" shape="pill" variant={variant}>
      {label}
    </Badge>
  );
}

function changeTypeBadge(changeType: string) {
  const variant = changeType === "create" ? "success" : changeType === "delete" ? "error" : "info";
  return (
    <Badge size="sm" shape="pill" variant={variant}>
      {changeType}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VersionHistory({ entityType, entitySlug, isOpen, onClose }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Not `${entityType}s`: that yields `utilitys`, and leaves the underscore
      // in every multi-word type. Four of nine happened to work.
      const path = versionsPath(entityType, entitySlug);
      if (!path) {
        setVersions([]);
        setError(`No version history available for ${entityType}`);
        return;
      }
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      const json = await res.json();
      setVersions(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entitySlug]);

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, fetchVersions]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close version history"
        className="fixed inset-0 z-40 bg-black/30 transition-opacity border-0 cursor-default"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter") onClose();
        }}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] bg-background-surface border-l border-border-default shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div className="flex items-center gap-2">
            <Icon name="ClockCounterClockwise" size={18} className="text-brand-primary" />
            <span className="text-base font-semibold text-text-heading">Version History</span>
          </div>
          <Button variant="icon" onPress={onClose} aria-label="Close">
            <Icon name="X" size={18} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader size={24} />
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {!isLoading && !error && versions.length === 0 && (
            <div className="text-center py-12">
              <Icon name="ClockCounterClockwise" size={32} className="text-text-muted mx-auto mb-3" />
              <div className="text-sm text-text-muted">No version history available yet.</div>
              <div className="text-xs text-text-muted mt-1">
                History is tracked after entity data is synced to the database.
              </div>
            </div>
          )}

          {!isLoading && !error && versions.length > 0 && (
            <Timeline>
              {[...versions].reverse().map((version) => {
                const isExpanded = expandedId === version.id;
                const delta = version.delta;
                const deltaKeys = delta ? Object.keys(delta) : [];

                return (
                  <TimelineItem key={version.id}>
                    <div className="pb-4">
                      {/* Version header */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-text-heading">v{version.versionNumber}</span>
                        {changeTypeBadge(version.changeType)}
                        {sourceTypeBadge(version.sourceType)}
                      </div>

                      {/* Meta */}
                      <div className="text-xs text-text-muted mb-1">
                        {formatDate(version.changedAt)}
                        {version.changedBy && <span> · {version.changedBy}</span>}
                      </div>

                      {/* Summary */}
                      {version.changeSummary && (
                        <div className="text-sm text-text-body mb-2">{version.changeSummary}</div>
                      )}

                      {/* Expandable diff */}
                      {deltaKeys.length > 0 && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : version.id)}
                            className="text-xs text-brand-primary hover:underline flex items-center gap-1"
                          >
                            <Icon name={isExpanded ? "CaretDown" : "CaretRight"} size={12} />
                            {deltaKeys.length} field{deltaKeys.length !== 1 ? "s" : ""} changed
                          </button>

                          {isExpanded && (
                            <Card variant="outlined" className="mt-2">
                              <Card.Content className="p-3 space-y-2">
                                {deltaKeys.map((key) => {
                                  const change = delta?.[key];
                                  if (!change) return null;
                                  return (
                                    <div key={key} className="text-xs">
                                      <div className="font-medium text-text-heading mb-0.5">{key}</div>
                                      <div className="flex gap-2 items-baseline">
                                        <span className="text-red-500 line-through">
                                          {change.old != null ? String(change.old) : "—"}
                                        </span>
                                        <Icon name="ArrowRight" size={10} className="text-text-muted flex-shrink-0" />
                                        <span className="text-green-600">
                                          {change.new != null ? String(change.new) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </Card.Content>
                            </Card>
                          )}
                        </div>
                      )}
                    </div>
                  </TimelineItem>
                );
              })}
            </Timeline>
          )}
        </div>
      </div>
    </>
  );
}
