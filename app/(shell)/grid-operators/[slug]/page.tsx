"use client";

import { SignInButton } from "@clerk/nextjs";
import {
  Avatar,
  Badge,
  Button,
  type Column,
  DataTable,
  Dialog,
  InteractiveMap,
  Loader,
  layer,
  type StatItem,
  StatList,
} from "@texturehq/edges";
import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EntityActions } from "@/components/contributions/EntityActions";
import { InlineFieldEdit } from "@/components/contributions/InlineFieldEdit";
import {
  EntityList,
  EntityMap,
  EntityPageHeader,
  EntitySection,
  EntityStatsRow,
  RelationshipCards,
} from "@/components/entity";
import { useBalancingAuthority } from "@/hooks/useBalancingAuthority";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIso } from "@/hooks/useIso";
import { usePowerPlantList } from "@/hooks/usePowerPlantList";
import { useProgramList } from "@/hooks/useProgramList";
import { useRto } from "@/hooks/useRto";
import { useTransmissionLineList } from "@/hooks/useTransmissionLineList";
import { useUtility } from "@/hooks/useUtility";
import { useUtilityList } from "@/hooks/useUtilityList";
import { getRegionById } from "@/lib/data";
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
import { computeViewStateFromGeoJSON, safeHostname } from "@/lib/geo";
import type { Utility } from "@/types/entities";
import type { TransmissionLine } from "@/types/transmission-lines";

// Map utility segments to categorical colors from edges design system
function getTerritoryColor(segment: string | null | undefined): string {
  const segmentColorMap: Record<string, string> = {
    INVESTOR_OWNED_UTILITY: "#5424db", // viz-categorical-1 — Deep Violet
    DISTRIBUTION_COOPERATIVE: "#e86a00", // viz-categorical-3 — Burnt Orange
    MUNICIPAL_UTILITY: "#0ba286", // viz-categorical-7 — Teal
    COMMUNITY_CHOICE_AGGREGATOR: "#9a47e2", // viz-categorical-5 — Purple
    GENERATION_AND_TRANSMISSION: "#52a119", // viz-categorical-10 — Lime Green
    POLITICAL_SUBDIVISION: "#5d89ff", // viz-categorical-4 — Cornflower
    TRANSMISSION_OPERATOR: "#046691", // viz-categorical-12 — Deep Cyan
    JOINT_ACTION_AGENCY: "#9c28af", // viz-categorical-8 — Purple-Magenta
    FEDERAL: "#ff513d", // viz-categorical-11 — Red-Orange
  };
  return segmentColorMap[segment ?? ""] ?? "#5424db"; // Default to viz-categorical-1
}

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

function formatRevenue(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function formatSales(v: number): string {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M MWh` : `${v.toLocaleString()} MWh`;
}

// Hook: builds a single StatList items[] for a section, attaching an edit
// affordance (iconRight + onAction) to rows whose `id` matches an editable
// field. The modal/auth chrome is rendered once by the section, not per row,
// so StatList sees a single list and can draw dividers between all rows.
interface EditableFieldRef {
  id: string;
  fieldName: string;
  // Key on the entity object used to read the current value (camelCase),
  // since `fieldName` is the DB column name (snake_case).
  valueKey: string;
}

function useEditableStatItems({
  items,
  editableFields,
  entityType,
  entityId,
  entityName,
  currentValues,
  onEdited,
}: {
  items: StatItem[];
  editableFields: EditableFieldRef[];
  entityType: string;
  entityId: string;
  entityName: string;
  currentValues: Record<string, unknown>;
  onEdited: () => void;
}): { items: StatItem[]; chrome: React.ReactNode } {
  const { user, isLoading } = useCurrentUser();
  const [editingField, setEditingField] = useState<EditableFieldRef | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);

  const enriched = useMemo<StatItem[]>(() => {
    return items.map((item) => {
      const editable = editableFields.find((f) => f.id === item.id);
      if (!editable) return item;
      const handleAction = () => {
        if (!user && !isLoading) {
          setShowSignInModal(true);
        } else if (user) {
          setEditingField(editable);
        }
      };

      return {
        ...item,
        iconRight: (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
              }
            }}
            className="contents"
          >
            <Button
              icon="PencilSimple"
              size="sm"
              variant="ghost"
              onPress={handleAction}
              aria-label={`Edit ${item.label}`}
            />
          </button>
        ),
      };
    });
  }, [items, editableFields, user, isLoading]);

  const currentVersion = (currentValues?.version as number) ?? 1;
  const currentValue = editingField ? currentValues?.[editingField.valueKey] : undefined;

  const chrome = (
    <>
      {editingField && (
        <InlineFieldEdit
          isOpen={true}
          onClose={() => setEditingField(null)}
          entityType={entityType}
          entityId={entityId}
          entityName={entityName}
          fieldName={editingField.fieldName}
          currentValue={currentValue}
          currentVersion={currentVersion}
          onSubmitted={() => {
            setEditingField(null);
            onEdited();
          }}
        />
      )}

      <Dialog isOpen={showSignInModal} onClose={() => setShowSignInModal(false)} title="Help improve CommonGrid">
        <div className="space-y-6 p-6">
          <p className="text-base text-text-body leading-relaxed">
            Sign in to suggest edits, fix inaccuracies, and help keep US energy infrastructure data accurate and
            up-to-date. Your contributions make CommonGrid better for everyone.
          </p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="secondary" onPress={() => setShowSignInModal(false)}>
              Cancel
            </Button>
            <SignInButton mode="modal">
              <Button variant="primary">Sign In</Button>
            </SignInButton>
          </div>
        </div>
      </Dialog>
    </>
  );

  return { items: enriched, chrome };
}

// Overview section component
function OverviewStatList({ utility }: { utility: Utility }) {
  const items: StatItem[] = [
    {
      id: "segment",
      label: "SEGMENT",
      value: <Badge variant={getSegmentBadgeVariant(utility.segment)}>{getSegmentLabel(utility.segment)}</Badge>,
    },
    {
      id: "status",
      label: "STATUS",
      value: <Badge variant={getStatusBadgeVariant(utility.status)}>{getStatusLabel(utility.status)}</Badge>,
    },
    {
      id: "customers",
      label: "CUSTOMERS",
      value: utility.customerCount ? formatCustomerCount(utility.customerCount) : null,
    },
    {
      id: "jurisdiction",
      label: "JURISDICTION",
      value: utility.jurisdiction ?? null,
    },
    {
      id: "eiaId",
      label: "EIA ID",
      value: utility.eiaId ?? null,
      copyable: true,
    },
    {
      id: "website",
      label: "WEBSITE",
      value: utility.website ? safeHostname(utility.website) : null,
      href: utility.website ?? undefined,
    },
  ].filter((item) => item.value !== null && item.value !== undefined);

  const editableFields: EditableFieldRef[] = [
    { id: "segment", fieldName: "segment", valueKey: "segment" },
    { id: "status", fieldName: "status", valueKey: "status" },
    { id: "customers", fieldName: "customer_count", valueKey: "customerCount" },
    { id: "jurisdiction", fieldName: "jurisdiction", valueKey: "jurisdiction" },
    { id: "eiaId", fieldName: "eia_id", valueKey: "eiaId" },
    { id: "website", fieldName: "website", valueKey: "website" },
  ];

  const { items: enriched, chrome } = useEditableStatItems({
    items,
    editableFields,
    entityType: "utility",
    entityId: utility.id,
    entityName: utility.name,
    currentValues: utility as unknown as Record<string, unknown>,
    onEdited: () => window.location.reload(),
  });

  return (
    <>
      <StatList items={enriched} layout="one-column" showDividers />
      {chrome}
    </>
  );
}

// Operations section component
function OperationsStatList({ utility }: { utility: Utility }) {
  const items: StatItem[] = [
    ...(utility.peakDemandMw !== null
      ? [
          {
            id: "summerPeak",
            label: "SUMMER PEAK DEMAND",
            value: `${utility.peakDemandMw.toLocaleString()} MW`,
          },
        ]
      : []),
    ...(utility.winterPeakDemandMw !== null
      ? [
          {
            id: "winterPeak",
            label: "WINTER PEAK DEMAND",
            value: `${utility.winterPeakDemandMw.toLocaleString()} MW`,
          },
        ]
      : []),
    ...(utility.totalRevenueDollars !== null
      ? [
          {
            id: "revenue",
            label: "TOTAL REVENUE",
            value: formatRevenue(utility.totalRevenueDollars),
          },
        ]
      : []),
    ...(utility.totalSalesMwh !== null
      ? [
          {
            id: "sales",
            label: "TOTAL SALES",
            value: formatSales(utility.totalSalesMwh),
          },
        ]
      : []),
    ...(utility.totalMeterCount !== null
      ? [
          {
            id: "meters",
            label: "TOTAL METERS",
            value: utility.totalMeterCount.toLocaleString(),
          },
        ]
      : []),
    ...(utility.amiMeterCount !== null
      ? [
          {
            id: "amiMeters",
            label: "AMI METERS",
            value: `${utility.amiMeterCount.toLocaleString()}${utility.totalMeterCount ? ` (${Math.round((utility.amiMeterCount / utility.totalMeterCount) * 100)}%)` : ""}`,
          },
        ]
      : []),
    ...(utility.nercRegion !== null
      ? [
          {
            id: "nercRegion",
            label: "NERC REGION",
            value: utility.nercRegion,
          },
        ]
      : []),
  ];

  const editableFields: EditableFieldRef[] = [
    { id: "summerPeak", fieldName: "peak_demand_mw", valueKey: "peakDemandMw" },
    { id: "winterPeak", fieldName: "winter_peak_demand_mw", valueKey: "winterPeakDemandMw" },
    { id: "revenue", fieldName: "total_revenue_dollars", valueKey: "totalRevenueDollars" },
    { id: "sales", fieldName: "total_sales_mwh", valueKey: "totalSalesMwh" },
    { id: "meters", fieldName: "total_meter_count", valueKey: "totalMeterCount" },
    { id: "amiMeters", fieldName: "ami_meter_count", valueKey: "amiMeterCount" },
    { id: "nercRegion", fieldName: "nerc_region", valueKey: "nercRegion" },
  ];

  const { items: enriched, chrome } = useEditableStatItems({
    items,
    editableFields,
    entityType: "utility",
    entityId: utility.id,
    entityName: utility.name,
    currentValues: utility as unknown as Record<string, unknown>,
    onEdited: () => window.location.reload(),
  });

  return (
    <>
      <StatList items={enriched} layout="one-column" showDividers />
      {chrome}
    </>
  );
}

// Transmission section component
function TransmissionStatList({
  utilityLines,
  linesTotalMiles,
}: {
  utilityLines: TransmissionLine[];
  linesTotalMiles: number;
}) {
  const voltages = utilityLines.map((l) => l.voltage).filter((v): v is number => v !== null && v > 0);
  const voltageRangeValue = (() => {
    if (voltages.length === 0) return null;
    const min = Math.min(...voltages);
    const max = Math.max(...voltages);
    return min === max ? `${min} kV` : `${min}–${max} kV`;
  })();

  const items: StatItem[] = [
    {
      id: "lineCount",
      label: "TOTAL LINES",
      value: utilityLines.length.toLocaleString(),
    },
    {
      id: "totalMiles",
      label: "TOTAL MILES",
      value: Math.round(linesTotalMiles).toLocaleString(),
    },
    {
      id: "voltageRange",
      label: "VOLTAGE RANGE",
      value: voltageRangeValue,
    },
  ].filter((item) => item.value !== null);

  return <StatList items={items} layout="one-column" showDividers />;
}

export default function UtilityDetailPage() {
  const params = useParams<{ slug: string }>();
  const { utility, isLoading: utilityLoading } = useUtility(params.slug);
  const { utilities, isLoading: utilitiesLoading } = useUtilityList({ limit: 500 });

  const [territoryGeoJSON, setTerritoryGeoJSON] = useState<FeatureCollection | null>(null);
  const [territoryLoading, setTerritoryLoading] = useState(true);

  const { iso } = useIso(utility?.isoId ?? null);
  const { rto } = useRto(utility?.rtoId ?? null);
  const { balancingAuthority: ba } = useBalancingAuthority(utility?.balancingAuthorityId ?? null);
  const parent = useMemo(
    () => (utility?.parentId ? (utilities.find((u) => u.id === utility.parentId) ?? null) : null),
    [utility, utilities]
  );
  const generationProvider = useMemo(
    () =>
      utility?.generationProviderId ? (utilities.find((u) => u.id === utility.generationProviderId) ?? null) : null,
    [utility, utilities]
  );
  const transmissionProvider = useMemo(
    () =>
      utility?.transmissionProviderId ? (utilities.find((u) => u.id === utility.transmissionProviderId) ?? null) : null,
    [utility, utilities]
  );
  const successor = useMemo(
    () => (utility?.successorId ? (utilities.find((u) => u.id === utility.successorId) ?? null) : null),
    [utility, utilities]
  );
  const region = useMemo(
    () => (utility?.serviceTerritoryId ? getRegionById(utility.serviceTerritoryId) : null),
    [utility]
  );

  useEffect(() => {
    if (!region?.slug) {
      setTerritoryLoading(false);
      return;
    }
    fetch(`/api/v1/territories/${region.slug}/geometry`)
      .then((res) => (res.ok ? res.json() : null))
      .then((apiResponse) => {
        if (!apiResponse?.data) {
          setTerritoryGeoJSON(null);
          return;
        }
        // Wrap the API geometry response in a FeatureCollection
        const featureCollection: FeatureCollection = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                id: region.id,
                name: region.name,
                slug: region.slug,
              },
              geometry: apiResponse.data,
            },
          ],
        };
        setTerritoryGeoJSON(featureCollection);
      })
      .catch(() => setTerritoryGeoJSON(null))
      .finally(() => setTerritoryLoading(false));
  }, [region]);

  const generationMembers = useMemo(
    () => (utility ? utilities.filter((u) => u.generationProviderId === utility.id) : []),
    [utility, utilities]
  );
  const transmissionMembers = useMemo(
    () => (utility ? utilities.filter((u) => u.transmissionProviderId === utility.id) : []),
    [utility, utilities]
  );
  const childUtilities = useMemo(
    () => (utility ? utilities.filter((u) => u.parentId === utility.id) : []),
    [utility, utilities]
  );

  const servedRows: UtilityRow[] = useMemo(() => {
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

  const childRows: UtilityRow[] = useMemo(
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

  const { powerPlants: utilityPowerPlants, isLoading: plantsLoading } = usePowerPlantList({
    utilityId: utility?.id,
    limit: 200,
  });

  const { programs: allPrograms, isLoading: programsLoading } = useProgramList({ limit: 200 });
  const utilityPrograms = useMemo(
    () => (utility ? allPrograms.filter((p) => p.organizations.some((o) => o.entityId === utility.slug)) : []),
    [utility, allPrograms]
  );

  const { transmissionLines: utilityLines, isLoading: linesLoading } = useTransmissionLineList({
    owner: utility?.name,
    limit: 200,
  });
  const linesTotalMiles = useMemo(() => utilityLines.reduce((sum, l) => sum + (l.lengthMiles || 0), 0), [utilityLines]);

  const utilityColumns: Column<UtilityRow>[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        accessor: "name",
        render: (_value: unknown, row: UtilityRow) => (
          <Link href={`/grid-operators/${row.slug}`} className="font-medium text-text-body hover:text-brand-primary">
            {row.name}
          </Link>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "segment",
        label: "Segment",
        accessor: "segment",
        render: (_value: unknown, row: UtilityRow) => (
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
        render: (_value: unknown, row: UtilityRow) => <span>{formatCustomerCount(row.customerCount)}</span>,
        mobile: false,
      },
    ],
    []
  );

  const handleRowClick = useCallback((row: UtilityRow) => {
    window.location.href = `/grid-operators/${row.slug}`;
  }, []);

  const mapViewState = useMemo(() => {
    if (territoryGeoJSON) {
      return computeViewStateFromGeoJSON(territoryGeoJSON) ?? { longitude: -98.58, latitude: 39.83, zoom: 4 };
    }
    return { longitude: -98.58, latitude: 39.83, zoom: 4 };
  }, [territoryGeoJSON]);

  if (utilitiesLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

  if (utilityLoading) {
    return (
      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </div>
    );
  }

  if (!utility) {
    notFound();
  }

  const hasOperationsData =
    utility.peakDemandMw !== null ||
    utility.winterPeakDemandMw !== null ||
    utility.totalRevenueDollars !== null ||
    utility.totalSalesMwh !== null ||
    utility.amiMeterCount !== null ||
    utility.totalMeterCount !== null ||
    utility.nercRegion !== null ||
    utility.hasGeneration !== null;

  const hasGridRelationships = iso || rto || ba;
  const hasUtilityRelationships = parent || generationProvider || transmissionProvider || successor;

  return (
    <>
      <EntityPageHeader
        entityName={utility.name}
        subtitle={
          <>
            {utility.shortName && <span>{utility.shortName}</span>}
            {utility.shortName && (utility.website || utility.jurisdiction) && (
              <span className="text-text-muted mx-2">·</span>
            )}
            {utility.website && (
              <a href={utility.website} target="_blank" rel="noopener noreferrer">
                {safeHostname(utility.website)}
              </a>
            )}
            {utility.jurisdiction && (
              <>
                {utility.website && <span className="text-text-muted mx-2">·</span>}
                <span>{utility.jurisdiction}</span>
              </>
            )}
          </>
        }
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Grid Operators", href: "/grid-operators" },
          { label: utility.slug },
        ]}
        avatar={
          <Avatar
            {...(utility.logo ? { src: utility.logo } : {})}
            fullName={utility.name}
            size="xl"
            shape="square"
            variant="organization"
          />
        }
        actions={
          <EntityActions
            entityType="utility"
            entityId={utility.id}
            entitySlug={utility.slug}
            entityName={utility.name}
            currentValues={utility as unknown as Record<string, unknown>}
          />
        }
      />

      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        <EntityStatsRow
          stats={[
            {
              label: "Customers",
              value: utility.customerCount,
              formatter: (v) => formatCustomerCount(v as number | null),
            },
            {
              label: "Summer Peak",
              value: utility.peakDemandMw,
              formatter: (v) => (v == null ? "—" : `${(v as number).toLocaleString()} MW`),
            },
            {
              label: "Annual Sales",
              value: utility.totalSalesMwh,
              formatter: (v) => (v == null ? "—" : formatSales(v as number)),
            },
            {
              label: "Revenue",
              value: utility.totalRevenueDollars,
              formatter: (v) => (v == null ? "—" : formatRevenue(v as number)),
            },
          ]}
        />

        <EntitySection id="overview" title="Overview">
          <OverviewStatList utility={utility} />
        </EntitySection>

        {hasOperationsData && (
          <EntitySection id="operations" title="Operations">
            <OperationsStatList utility={utility} />
            {utility.hasGeneration !== null &&
              (utility.hasGeneration || utility.hasTransmission || utility.hasDistribution) && (
                <div style={{ marginTop: 16 }}>
                  <div className="text-text-caption text-sm mb-3">Activities</div>
                  <div className="flex flex-wrap gap-2">
                    {utility.hasGeneration && (
                      <Badge size="sm" shape="pill" variant="info">
                        Generation
                      </Badge>
                    )}
                    {utility.hasTransmission && (
                      <Badge size="sm" shape="pill" variant="info">
                        Transmission
                      </Badge>
                    )}
                    {utility.hasDistribution && (
                      <Badge size="sm" shape="pill" variant="info">
                        Distribution
                      </Badge>
                    )}
                  </div>
                </div>
              )}
          </EntitySection>
        )}

        <EntitySection id="territory" title="Service Territory">
          <EntityMap loading={territoryLoading}>
            {!territoryLoading && (
              <InteractiveMap
                {...(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && {
                  mapboxAccessToken: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
                })}
                initialViewState={mapViewState}
                mapType="neutral"
                controls={[{ type: "navigation", position: "bottom-right", showResetZoom: true }]}
                layers={
                  territoryGeoJSON
                    ? [
                        layer.geojson({
                          id: "territory-fill",
                          data: territoryGeoJSON,
                          renderAs: "fill",
                          style: {
                            color: { hex: getTerritoryColor(utility?.segment) },
                            fillOpacity: 0.25,
                            borderWidth: 3,
                            borderColor: { hex: getTerritoryColor(utility?.segment) },
                          },
                        }),
                      ]
                    : []
                }
              />
            )}
          </EntityMap>
        </EntitySection>

        {hasGridRelationships && (
          <EntitySection id="grid" title="Grid Relationships">
            <RelationshipCards
              items={[
                ...(iso ? [{ label: "ISO", name: iso.shortName, href: `/explore?view=iso&slug=${iso.slug}` }] : []),
                ...(rto ? [{ label: "RTO", name: rto.shortName, href: `/explore?view=rto&slug=${rto.slug}` }] : []),
                ...(ba
                  ? [{ label: "Balancing Authority", name: ba.shortName, href: `/balancing-authorities/${ba.slug}` }]
                  : []),
              ]}
            />
          </EntitySection>
        )}

        {hasUtilityRelationships && (
          <EntitySection id="relationships" title="Utility Relationships">
            <RelationshipCards
              items={[
                ...(parent ? [{ label: "Parent", name: parent.name, href: `/grid-operators/${parent.slug}` }] : []),
                ...(generationProvider
                  ? [
                      {
                        label: "Generation Provider",
                        name: generationProvider.name,
                        href: `/grid-operators/${generationProvider.slug}`,
                      },
                    ]
                  : []),
                ...(transmissionProvider
                  ? [
                      {
                        label: "Transmission Provider",
                        name: transmissionProvider.name,
                        href: `/grid-operators/${transmissionProvider.slug}`,
                      },
                    ]
                  : []),
                ...(successor
                  ? [{ label: "Successor", name: successor.name, href: `/grid-operators/${successor.slug}` }]
                  : []),
              ]}
            />
          </EntitySection>
        )}

        {servedRows.length > 0 && (
          <EntitySection id="served" title="Served Utilities">
            <div className="text-text-caption text-sm mb-3">
              {servedRows.length} utilit{servedRows.length !== 1 ? "ies" : "y"}
            </div>
            <div className="rounded-lg border border-border-default overflow-hidden">
              <DataTable
                data={servedRows}
                columns={utilityColumns}
                mobileBreakpoint="md"
                isLoading={false}
                onRowClick={handleRowClick}
              />
            </div>
          </EntitySection>
        )}

        {childRows.length > 0 && (
          <EntitySection id="subsidiaries" title="Subsidiary Utilities">
            <div className="text-text-caption text-sm mb-3">
              {childRows.length} subsidiar{childRows.length !== 1 ? "ies" : "y"}
            </div>
            <div className="rounded-lg border border-border-default overflow-hidden">
              <DataTable
                data={childRows}
                columns={utilityColumns}
                mobileBreakpoint="md"
                isLoading={false}
                onRowClick={handleRowClick}
              />
            </div>
          </EntitySection>
        )}

        {!programsLoading && utilityPrograms.length > 0 && (
          <EntitySection id="programs" title="Programs">
            <div className="detail-list-meta">
              {utilityPrograms.length} program{utilityPrograms.length !== 1 ? "s" : ""}
            </div>
            <EntityList
              items={utilityPrograms.map((prog) => ({
                // Programs have no standalone `/programs/[slug]` route — they
                // are viewed inside Explore. `/programs/<slug>` 404'd.
                href: `/explore?tab=programs&slug=${prog.slug}`,
                name: prog.name,
                badge: (
                  <Badge size="sm" shape="pill" variant={prog.status === "ACTIVE" ? "success" : "neutral"}>
                    {prog.status}
                  </Badge>
                ),
                meta: prog.assetTypes.join(", "),
              }))}
            />
          </EntitySection>
        )}

        {!linesLoading && utilityLines.length > 0 && (
          <EntitySection id="transmission" title="Transmission Lines">
            <TransmissionStatList utilityLines={utilityLines} linesTotalMiles={linesTotalMiles} />
          </EntitySection>
        )}

        {!plantsLoading && utilityPowerPlants.length > 0 && (
          <EntitySection id="power-plants" title="Power Plants">
            <EntityList
              items={utilityPowerPlants.map((plant) => ({
                href: `/power-plants/${plant.slug}`,
                name: plant.name,
                dotColor: getFuelCategoryColor(plant.fuelCategory),
                badge: (
                  <Badge size="sm" shape="pill" variant={getFuelBadgeVariant(plant.fuelCategory)}>
                    {getFuelCategoryLabel(plant.fuelCategory)}
                  </Badge>
                ),
                meta: formatCapacity(plant.totalCapacityMw),
              }))}
              headerMeta={`${utilityPowerPlants.length} plant${utilityPowerPlants.length !== 1 ? "s" : ""} · ${formatCapacity(utilityPowerPlants.reduce((sum, p) => sum + p.totalCapacityMw, 0))} total`}
            />
          </EntitySection>
        )}
      </div>
    </>
  );
}
