"use client";

import { SignInButton } from "@clerk/nextjs";
import {
  Avatar,
  Badge,
  Button,
  type Column,
  DataTable,
  Dialog,
  Icon,
  InteractiveMap,
  Loader,
  layer,
  type StatItem,
  StatList,
  Tooltip,
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
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getBalancingAuthorityById, getIsoById, getRegionById, getRtoById } from "@/lib/data";
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
import { filterByUtility, usePowerPlants } from "@/lib/power-plants";
import { filterProgramsByUtility, usePrograms } from "@/lib/programs-client";
import { filterLinesByOwner, useTransmissionLines } from "@/lib/transmission-lines-client";
import { useUtilities } from "@/lib/utilities-client";
import type { Utility } from "@/types/entities";
import type { TransmissionLine } from "@/types/transmission-lines";

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

// Helper component for StatList items with inline editing
function EditableStatItem({
  item,
  entityType,
  entityId,
  entityName,
  fieldName,
  currentValues,
  onEdited,
}: {
  item: StatItem;
  entityType: string;
  entityId: string;
  entityName: string;
  fieldName: string;
  currentValues: Record<string, unknown>;
  onEdited: () => void;
}) {
  const { user, isLoading } = useCurrentUser();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(hasTouch);
  }, []);

  const handleEditClick = () => {
    if (!user && !isLoading) {
      setShowSignInModal(true);
    } else if (user) {
      setShowEditModal(true);
    }
  };

  const currentVersion = (currentValues?.version as number) ?? 1;
  const currentValue = currentValues?.[fieldName];

  const editButton =
    isTouchDevice || isHovering ? (
      <Tooltip content="Edit this field" placement="top">
        <button
          type="button"
          onClick={handleEditClick}
          className="text-text-muted hover:text-text-body transition-colors"
          aria-label={`Edit ${item.label}`}
        >
          <Icon name="PencilSimple" size="xs" />
        </button>
      </Tooltip>
    ) : null;

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: div provides hover context */}
      <div
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsHovering(true)}
        onBlur={() => setIsHovering(false)}
        style={{ display: "contents" }}
      >
        <StatList
          items={[
            {
              ...item,
              iconRight: editButton,
            },
          ]}
          layout="one-column"
          showDividers
        />
      </div>

      {showEditModal && (
        <InlineFieldEdit
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          entityType={entityType}
          entityId={entityId}
          entityName={entityName}
          fieldName={fieldName}
          currentValue={currentValue}
          currentVersion={currentVersion}
          onSubmitted={() => {
            setShowEditModal(false);
            onEdited();
          }}
        />
      )}

      <Dialog isOpen={showSignInModal} onClose={() => setShowSignInModal(false)} title="Sign in to edit">
        <div className="space-y-4 p-4">
          <p className="text-sm text-text-body">Sign in to suggest edits and help improve CommonGrid data quality.</p>
          <div className="flex items-center justify-end gap-3">
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

  const editableFields = [
    { id: "customers", fieldName: "customer_count" },
    { id: "jurisdiction", fieldName: "jurisdiction" },
    { id: "website", fieldName: "website" },
  ];

  return (
    <>
      {items.map((item) => {
        const editableField = editableFields.find((f) => f.id === item.id);
        if (editableField) {
          return (
            <EditableStatItem
              key={item.id}
              item={item}
              entityType="utility"
              entityId={utility.id}
              entityName={utility.name}
              fieldName={editableField.fieldName}
              currentValues={utility as unknown as Record<string, unknown>}
              onEdited={() => window.location.reload()}
            />
          );
        }
        return <StatList key={item.id} items={[item]} layout="one-column" showDividers />;
      })}
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

  const editableFields = [
    { id: "summerPeak", fieldName: "peak_demand_mw" },
    { id: "winterPeak", fieldName: "winter_peak_demand_mw" },
    { id: "revenue", fieldName: "total_revenue_dollars" },
    { id: "sales", fieldName: "total_sales_mwh" },
    { id: "meters", fieldName: "total_meter_count" },
    { id: "amiMeters", fieldName: "ami_meter_count" },
  ];

  return (
    <>
      {items.map((item) => {
        const editableField = editableFields.find((f) => f.id === item.id);
        if (editableField) {
          return (
            <EditableStatItem
              key={item.id}
              item={item}
              entityType="utility"
              entityId={utility.id}
              entityName={utility.name}
              fieldName={editableField.fieldName}
              currentValues={utility as unknown as Record<string, unknown>}
              onEdited={() => window.location.reload()}
            />
          );
        }
        return <StatList key={item.id} items={[item]} layout="one-column" showDividers />;
      })}
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
  const { utilities, isLoading: utilitiesLoading } = useUtilities();
  const utility = useMemo(() => utilities.find((u) => u.slug === params.slug) ?? null, [utilities, params.slug]);

  const [territoryGeoJSON, setTerritoryGeoJSON] = useState<FeatureCollection | null>(null);
  const [territoryLoading, setTerritoryLoading] = useState(true);

  const iso = useMemo(() => (utility?.isoId ? getIsoById(utility.isoId) : null), [utility]);
  const rto = useMemo(() => (utility?.rtoId ? getRtoById(utility.rtoId) : null), [utility]);
  const ba = useMemo(
    () => (utility?.balancingAuthorityId ? getBalancingAuthorityById(utility.balancingAuthorityId) : null),
    [utility]
  );
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

  const territoryFileKey = useMemo(() => {
    if (!region) return null;
    if (region.type === "CCA_TERRITORY" || region.type === "ISO" || region.type === "CUSTOM") {
      return region.slug;
    }
    return region.eiaId;
  }, [region]);

  useEffect(() => {
    if (!territoryFileKey) {
      setTerritoryLoading(false);
      return;
    }
    fetch(`/data/territories/${territoryFileKey}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTerritoryGeoJSON(data as FeatureCollection | null))
      .catch(() => setTerritoryGeoJSON(null))
      .finally(() => setTerritoryLoading(false));
  }, [territoryFileKey]);

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

  const { plants: allPlants, isLoading: plantsLoading } = usePowerPlants();
  const utilityPowerPlants = useMemo(
    () => (utility ? filterByUtility(allPlants, utility.id) : []),
    [utility, allPlants]
  );

  const { programs: allPrograms, isLoading: programsLoading } = usePrograms();
  const utilityPrograms = useMemo(
    () => (utility ? filterProgramsByUtility(allPrograms, utility.slug) : []),
    [utility, allPrograms]
  );

  const { lines: allLines, isLoading: linesLoading } = useTransmissionLines();
  const utilityLines = useMemo(() => (utility ? filterLinesByOwner(allLines, utility.name) : []), [utility, allLines]);
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
      <div
        className="cg-detail"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}
      >
        <Loader size={32} />
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

  let sectionNum = 1;

  return (
    <>
      <EntityPageHeader
        kicker={getSegmentLabel(utility.segment)}
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
        dataSourcePaths={["data/utilities.json"]}
      />

      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        <EntityStatsRow
          stats={[
            {
              value: utility.customerCount ? formatCustomerCount(utility.customerCount) : null,
              label: "Customers",
            },
            {
              value: utility.peakDemandMw !== null ? `${utility.peakDemandMw.toLocaleString()} MW` : null,
              label: "Summer Peak",
            },
            {
              value: utility.totalSalesMwh !== null ? formatSales(utility.totalSalesMwh) : null,
              label: "Annual Sales",
            },
            {
              value: utility.totalRevenueDollars !== null ? formatRevenue(utility.totalRevenueDollars) : null,
              label: "Revenue",
            },
          ]}
        />

        <EntitySection id="overview" kicker={`0${sectionNum++} · Overview`} title="Overview">
          <OverviewStatList utility={utility} />
        </EntitySection>

        {hasOperationsData && (
          <EntitySection id="operations" kicker={`0${sectionNum++} · Operations`} title="Operations">
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

        <EntitySection id="territory" kicker={`0${sectionNum++} · Territory`} title="Service Territory">
          <EntityMap loading={territoryLoading}>
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
                          color: { token: "brand-primary" },
                          fillOpacity: 0.25,
                          borderWidth: 3,
                          borderColor: { token: "brand-primary" },
                        },
                      }),
                    ]
                  : []
              }
            />
          </EntityMap>
        </EntitySection>

        {hasGridRelationships && (
          <EntitySection id="grid" kicker={`0${sectionNum++} · Grid`} title="Grid Relationships">
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
          <EntitySection id="relationships" kicker={`0${sectionNum++} · Relationships`} title="Utility Relationships">
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
          <EntitySection id="served" kicker={`0${sectionNum++} · Served`} title="Served Utilities">
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
          <EntitySection id="subsidiaries" kicker={`0${sectionNum++} · Subsidiaries`} title="Subsidiary Utilities">
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
          <EntitySection id="programs" kicker={`0${sectionNum++} · Programs`} title="Programs">
            <div className="detail-list-meta">
              {utilityPrograms.length} program{utilityPrograms.length !== 1 ? "s" : ""}
            </div>
            <EntityList
              items={utilityPrograms.map((prog) => ({
                href: `/programs/${prog.slug}`,
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
          <EntitySection id="transmission" kicker={`0${sectionNum++} · Transmission`} title="Transmission Lines">
            <TransmissionStatList utilityLines={utilityLines} linesTotalMiles={linesTotalMiles} />
          </EntitySection>
        )}

        {!plantsLoading && utilityPowerPlants.length > 0 && (
          <EntitySection id="power-plants" kicker={`0${sectionNum++} · Power Plants`} title="Power Plants">
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
