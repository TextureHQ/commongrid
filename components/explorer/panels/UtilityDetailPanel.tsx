"use client";

import {
  Avatar,
  Badge,
  Card,
  type Column,
  DataControls,
  DataTable,
  Section,
} from "@texturehq/edges";
import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useExplorer } from "../ExplorerContext";
import {
  getBalancingAuthorityById,
  getIsoById,
  getRegionById,
  getRtoById,
  getUtilitiesByGenerationProvider,
  getUtilitiesByParent,
  getUtilitiesByTransmissionProvider,
  getUtilityById,
  getUtilityBySlug,
} from "@/lib/data";
import { usePowerPlants, filterByUtility } from "@/lib/power-plants";
import {
  formatCapacity,
  formatCustomerCount,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getSegmentBadgeVariant,
  getSegmentLabel,
  getStatusBadgeVariant,
  getStatusLabel,
} from "@/lib/formatting";
import { safeHostname } from "@/lib/geo";

interface ServedUtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

export function UtilityDetailPanel({ slug }: { slug: string }) {
  const { navigateToDetail, goBack, setHighlight } = useExplorer();

  const utility = getUtilityBySlug(slug);

  const iso = utility?.isoId ? getIsoById(utility.isoId) : null;
  const rto = utility?.rtoId ? getRtoById(utility.rtoId) : null;
  const ba = utility?.balancingAuthorityId ? getBalancingAuthorityById(utility.balancingAuthorityId) : null;
  const parent = utility?.parentId ? getUtilityById(utility.parentId) : null;
  const generationProvider = utility?.generationProviderId ? getUtilityById(utility.generationProviderId) : null;
  const transmissionProvider = utility?.transmissionProviderId ? getUtilityById(utility.transmissionProviderId) : null;
  const successor = utility?.successorId ? getUtilityById(utility.successorId) : null;

  const region = utility?.serviceTerritoryId ? getRegionById(utility.serviceTerritoryId) : null;

  const territoryFileKey = useMemo(() => {
    if (!region) return null;
    if (region.type === "CCA_TERRITORY" || region.type === "ISO" || region.type === "CUSTOM") {
      return region.slug;
    }
    return region.eiaId;
  }, [region]);

  // Load territory GeoJSON and send to map for highlighting
  useEffect(() => {
    if (!territoryFileKey) {
      setHighlight(null);
      return;
    }
    fetch(`/data/territories/${territoryFileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setHighlight(data as FeatureCollection | null);
      })
      .catch(() => setHighlight(null));

    return () => setHighlight(null);
  }, [territoryFileKey, setHighlight]);

  const generationMembers = useMemo(() => (utility ? getUtilitiesByGenerationProvider(utility.id) : []), [utility]);
  const transmissionMembers = useMemo(() => (utility ? getUtilitiesByTransmissionProvider(utility.id) : []), [utility]);
  const childUtilities = useMemo(() => (utility ? getUtilitiesByParent(utility.id) : []), [utility]);

  const servedRows: ServedUtilityRow[] = useMemo(() => {
    const seen = new Set<string>();
    const combined = [...generationMembers, ...transmissionMembers];
    return combined
      .filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      })
      .map((u) => ({
        slug: u.slug,
        name: u.name,
        segment: u.segment,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
      }));
  }, [generationMembers, transmissionMembers]);

  const childRows: ServedUtilityRow[] = useMemo(
    () =>
      childUtilities.map((u) => ({
        slug: u.slug,
        name: u.name,
        segment: u.segment,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
      })),
    [childUtilities]
  );

  const { plants: allPlants } = usePowerPlants();
  const utilityPowerPlants = useMemo(() => (utility ? filterByUtility(allPlants, utility.id) : []), [utility, allPlants]);

  const handleServedRowClick = useCallback(
    (row: ServedUtilityRow) => {
      navigateToDetail("utility", row.slug);
    },
    [navigateToDetail]
  );

  const servedColumns: Column<ServedUtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: ServedUtilityRow) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigateToDetail("utility", row.slug);
            }}
            className="font-medium text-text-body hover:text-brand-primary"
          >
            {row.name}
          </button>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "segment",
        label: "Segment",
        accessor: "segment",
        render: (_value: unknown, row: ServedUtilityRow) => (
          <Badge size="sm" shape="pill" variant={getSegmentBadgeVariant(row.segment)}>
            {getSegmentLabel(row.segment)}
          </Badge>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "customerCount",
        label: "Customers",
        accessor: "customerCount",
        render: (_value: unknown, row: ServedUtilityRow) => (
          <span className="text-text-body">{formatCustomerCount(row.customerCount)}</span>
        ),
        mobile: false,
      },
    ],
    [navigateToDetail]
  );

  if (!utility) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-none px-4 pt-4 pb-2">
          <button type="button" onClick={goBack} className="text-sm text-text-muted hover:text-text-body transition-colors mb-2">
            &larr; Back
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-text-muted">Utility not found</div>
      </div>
    );
  }

  const hasOperationsData =
    utility.peakDemandMw !== null ||
    utility.winterPeakDemandMw !== null ||
    utility.totalRevenueDollars !== null ||
    utility.totalSalesMwh !== null ||
    utility.amiMeterCount !== null ||
    utility.totalMeterCount !== null ||
    utility.nercRegion !== null ||
    utility.baCode !== null ||
    utility.hasGeneration !== null;

  const hasGridRelationships = iso || rto || ba;
  const hasUtilityRelationships = parent || generationProvider || transmissionProvider || successor;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-none px-4 pt-4 pb-2">
        <button type="button" onClick={goBack} className="text-sm text-text-muted hover:text-text-body transition-colors mb-2">
          &larr; Back
        </button>
      </div>

      <div className="px-4 pb-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Avatar
            {...(utility.logo ? { src: utility.logo } : {})}
            fullName={utility.name}
            size="xl"
            shape="square"
            variant="organization"
          />
          <div>
            <h2 className="text-lg font-semibold text-text-heading">{utility.name}</h2>
            {utility.shortName && <div className="text-sm text-text-muted">{utility.shortName}</div>}
          </div>
        </div>

        {/* Overview */}
        <Section id="overview" title="Overview">
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-text-muted mb-0.5">Segment</div>
                  <Badge variant={getSegmentBadgeVariant(utility.segment)}>{getSegmentLabel(utility.segment)}</Badge>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-0.5">Status</div>
                  <Badge variant={getStatusBadgeVariant(utility.status)}>{getStatusLabel(utility.status)}</Badge>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-0.5">Customers</div>
                  <div className="text-sm font-medium">{formatCustomerCount(utility.customerCount)}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-0.5">Jurisdiction</div>
                  <div className="text-sm font-medium">{utility.jurisdiction || "\u2014"}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-0.5">EIA ID</div>
                  <div className="text-sm font-medium font-mono">{utility.eiaId ?? "\u2014"}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-0.5">Website</div>
                  <div className="text-sm font-medium">
                    {utility.website ? (
                      <a href={utility.website} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
                        {safeHostname(utility.website)}
                      </a>
                    ) : (
                      "\u2014"
                    )}
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Operations */}
        {hasOperationsData && (
          <Section id="operations" title="Operations">
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-2 gap-4">
                  {utility.peakDemandMw !== null && (
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">Summer Peak</div>
                      <div className="text-sm font-medium">{utility.peakDemandMw.toLocaleString()} MW</div>
                    </div>
                  )}
                  {utility.winterPeakDemandMw !== null && (
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">Winter Peak</div>
                      <div className="text-sm font-medium">{utility.winterPeakDemandMw.toLocaleString()} MW</div>
                    </div>
                  )}
                  {utility.totalRevenueDollars !== null && (
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">Revenue</div>
                      <div className="text-sm font-medium">
                        {utility.totalRevenueDollars >= 1_000_000_000
                          ? `$${(utility.totalRevenueDollars / 1_000_000_000).toFixed(1)}B`
                          : utility.totalRevenueDollars >= 1_000_000
                            ? `$${(utility.totalRevenueDollars / 1_000_000).toFixed(1)}M`
                            : `$${utility.totalRevenueDollars.toLocaleString()}`}
                      </div>
                    </div>
                  )}
                  {utility.totalSalesMwh !== null && (
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">Sales</div>
                      <div className="text-sm font-medium">
                        {utility.totalSalesMwh >= 1_000_000
                          ? `${(utility.totalSalesMwh / 1_000_000).toFixed(1)}M MWh`
                          : `${utility.totalSalesMwh.toLocaleString()} MWh`}
                      </div>
                    </div>
                  )}
                  {utility.totalMeterCount !== null && (
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">Meters</div>
                      <div className="text-sm font-medium">{utility.totalMeterCount.toLocaleString()}</div>
                    </div>
                  )}
                  {utility.amiMeterCount !== null && (
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">AMI Meters</div>
                      <div className="text-sm font-medium">
                        {utility.amiMeterCount.toLocaleString()}
                        {utility.totalMeterCount
                          ? ` (${Math.round((utility.amiMeterCount / utility.totalMeterCount) * 100)}%)`
                          : ""}
                      </div>
                    </div>
                  )}
                  {utility.nercRegion !== null && (
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">NERC Region</div>
                      <div className="text-sm font-medium font-mono">{utility.nercRegion}</div>
                    </div>
                  )}
                  {utility.hasGeneration !== null && (
                    <div className="col-span-2">
                      <div className="text-xs text-text-muted mb-0.5">Activities</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {utility.hasGeneration && <Badge size="sm" shape="pill" variant="info">Generation</Badge>}
                        {utility.hasTransmission && <Badge size="sm" shape="pill" variant="info">Transmission</Badge>}
                        {utility.hasDistribution && <Badge size="sm" shape="pill" variant="info">Distribution</Badge>}
                        {!utility.hasGeneration && !utility.hasTransmission && !utility.hasDistribution && (
                          <span className="text-text-muted">{"\u2014"}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}

        {/* Grid Relationships */}
        {hasGridRelationships && (
          <Section id="grid-relationships" title="Grid Relationships">
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-1 gap-3">
                  {iso && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">ISO</span>
                      <button
                        type="button"
                        onClick={() => navigateToDetail("iso", iso.slug)}
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {iso.shortName}
                      </button>
                    </div>
                  )}
                  {rto && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">RTO</span>
                      <button
                        type="button"
                        onClick={() => navigateToDetail("rto", rto.slug)}
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {rto.shortName}
                      </button>
                    </div>
                  )}
                  {ba && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Balancing Authority</span>
                      <button
                        type="button"
                        onClick={() => navigateToDetail("ba", ba.slug)}
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {ba.shortName}
                      </button>
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}

        {/* Utility Relationships */}
        {hasUtilityRelationships && (
          <Section id="utility-relationships" title="Utility Relationships">
            <Card variant="outlined">
              <Card.Content>
                <div className="grid grid-cols-1 gap-3">
                  {parent && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Parent</span>
                      <button
                        type="button"
                        onClick={() => navigateToDetail("utility", parent.slug)}
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {parent.name}
                      </button>
                    </div>
                  )}
                  {generationProvider && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Generation Provider</span>
                      <button
                        type="button"
                        onClick={() => navigateToDetail("utility", generationProvider.slug)}
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {generationProvider.name}
                      </button>
                    </div>
                  )}
                  {transmissionProvider && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Transmission Provider</span>
                      <button
                        type="button"
                        onClick={() => navigateToDetail("utility", transmissionProvider.slug)}
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {transmissionProvider.name}
                      </button>
                    </div>
                  )}
                  {successor && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Successor</span>
                      <button
                        type="button"
                        onClick={() => navigateToDetail("utility", successor.slug)}
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {successor.name}
                      </button>
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}

        {/* Served Utilities */}
        {servedRows.length > 0 && (
          <Section id="served-utilities" title="Served Utilities">
            <DataControls resultsCount={{ count: servedRows.length }} />
            <Card className="p-0 overflow-hidden">
              <DataTable
                data={servedRows}
                columns={servedColumns}
                mobileBreakpoint="md"
                isLoading={false}
                onRowClick={handleServedRowClick}
              />
            </Card>
          </Section>
        )}

        {/* Subsidiaries */}
        {childRows.length > 0 && (
          <Section id="subsidiaries" title="Subsidiary Utilities">
            <DataControls resultsCount={{ count: childRows.length }} />
            <Card className="p-0 overflow-hidden">
              <DataTable
                data={childRows}
                columns={servedColumns}
                mobileBreakpoint="md"
                isLoading={false}
                onRowClick={handleServedRowClick}
              />
            </Card>
          </Section>
        )}

        {/* Power Plants */}
        {utilityPowerPlants.length > 0 && (
          <Section id="power-plants" title="Power Plants">
            <div className="text-sm text-text-muted mb-3">
              {utilityPowerPlants.length} power plant{utilityPowerPlants.length !== 1 ? "s" : ""} ·{" "}
              {formatCapacity(utilityPowerPlants.reduce((sum, p) => sum + p.totalCapacityMw, 0))} total capacity
            </div>
            <div className="space-y-2">
              {utilityPowerPlants.slice(0, 20).map((plant) => (
                <Link
                  key={plant.id}
                  href={`/power-plants/${plant.slug}`}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-background-surface-hover transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getFuelCategoryColor(plant.fuelCategory) }}
                    />
                    <span className="text-sm font-medium text-text-body truncate">{plant.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <Badge size="sm" shape="pill" variant={getFuelBadgeVariant(plant.fuelCategory)}>
                      {getFuelCategoryLabel(plant.fuelCategory)}
                    </Badge>
                    <span className="text-xs text-text-muted">{formatCapacity(plant.totalCapacityMw)}</span>
                  </div>
                </Link>
              ))}
              {utilityPowerPlants.length > 20 && (
                <div className="text-xs text-text-muted text-center pt-1">
                  + {utilityPowerPlants.length - 20} more
                </div>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
