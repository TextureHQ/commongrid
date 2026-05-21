"use client";

import "../../detail-page.css";

import { Avatar, Badge, type Column, DataTable, InteractiveMap, Loader, layer } from "@texturehq/edges";
import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EntityActions } from "@/components/contributions/EntityActions";
import {
  DetailEntityList,
  DetailFieldList,
  DetailMap,
  DetailPageShell,
  DetailRelationships,
  DetailSection,
  DetailStatGrid,
} from "@/components/detail";
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
    <DetailPageShell
      kicker={getSegmentLabel(utility.segment)}
      entityName={utility.name}
      subtitle={
        <>
          {utility.shortName && <span>{utility.shortName}</span>}
          {utility.shortName && (utility.website || utility.jurisdiction) && <span className="sep">·</span>}
          {utility.website && (
            <a href={utility.website} target="_blank" rel="noopener noreferrer">
              {safeHostname(utility.website)}
            </a>
          )}
          {utility.jurisdiction && (
            <>
              {utility.website && <span className="sep">·</span>}
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
    >
      <DetailStatGrid
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

      <DetailSection id="overview" kicker={`0${sectionNum++} · Overview`} title="Overview">
        <DetailFieldList
          items={[
            {
              id: "segment",
              label: "Segment",
              value: (
                <Badge variant={getSegmentBadgeVariant(utility.segment)}>{getSegmentLabel(utility.segment)}</Badge>
              ),
            },
            {
              id: "status",
              label: "Status",
              value: <Badge variant={getStatusBadgeVariant(utility.status)}>{getStatusLabel(utility.status)}</Badge>,
            },
            {
              id: "customers",
              label: "Customers",
              value: utility.customerCount ? formatCustomerCount(utility.customerCount) : null,
              editable: true,
              fieldName: "customer_count",
            },
            {
              id: "jurisdiction",
              label: "Jurisdiction",
              value: utility.jurisdiction ?? null,
              editable: true,
              fieldName: "jurisdiction",
            },
            { id: "eiaId", label: "EIA ID", value: utility.eiaId ?? null, copyable: true },
            {
              id: "website",
              label: "Website",
              value: utility.website ? safeHostname(utility.website) : null,
              href: utility.website ?? undefined,
              editable: true,
              fieldName: "website",
            },
          ]}
          enableInlineEdit
          entityType="utility"
          entityId={utility.id}
          entityName={utility.name}
          currentValues={utility as unknown as Record<string, unknown>}
          onFieldEdited={() => {
            window.location.reload();
          }}
        />
      </DetailSection>

      {hasOperationsData && (
        <DetailSection id="operations" kicker={`0${sectionNum++} · Operations`} title="Operations">
          <DetailFieldList
            items={[
              ...(utility.peakDemandMw !== null
                ? [
                    {
                      id: "summerPeak",
                      label: "Summer Peak Demand",
                      value: `${utility.peakDemandMw.toLocaleString()} MW`,
                      editable: true,
                      fieldName: "peak_demand_mw",
                    },
                  ]
                : []),
              ...(utility.winterPeakDemandMw !== null
                ? [
                    {
                      id: "winterPeak",
                      label: "Winter Peak Demand",
                      value: `${utility.winterPeakDemandMw.toLocaleString()} MW`,
                      editable: true,
                      fieldName: "winter_peak_demand_mw",
                    },
                  ]
                : []),
              ...(utility.totalRevenueDollars !== null
                ? [
                    {
                      id: "revenue",
                      label: "Total Revenue",
                      value: formatRevenue(utility.totalRevenueDollars),
                      editable: true,
                      fieldName: "total_revenue_dollars",
                    },
                  ]
                : []),
              ...(utility.totalSalesMwh !== null
                ? [
                    {
                      id: "sales",
                      label: "Total Sales",
                      value: formatSales(utility.totalSalesMwh),
                      editable: true,
                      fieldName: "total_sales_mwh",
                    },
                  ]
                : []),
              ...(utility.totalMeterCount !== null
                ? [
                    {
                      id: "meters",
                      label: "Total Meters",
                      value: utility.totalMeterCount.toLocaleString(),
                      editable: true,
                      fieldName: "total_meter_count",
                    },
                  ]
                : []),
              ...(utility.amiMeterCount !== null
                ? [
                    {
                      id: "amiMeters",
                      label: "AMI Meters",
                      value: `${utility.amiMeterCount.toLocaleString()}${utility.totalMeterCount ? ` (${Math.round((utility.amiMeterCount / utility.totalMeterCount) * 100)}%)` : ""}`,
                      editable: true,
                      fieldName: "ami_meter_count",
                    },
                  ]
                : []),
              ...(utility.nercRegion !== null
                ? [{ id: "nercRegion", label: "NERC Region", value: utility.nercRegion }]
                : []),
            ]}
            enableInlineEdit
            entityType="utility"
            entityId={utility.id}
            entityName={utility.name}
            currentValues={utility as unknown as Record<string, unknown>}
            onFieldEdited={() => {
              window.location.reload();
            }}
          />
          {utility.hasGeneration !== null &&
            (utility.hasGeneration || utility.hasTransmission || utility.hasDistribution) && (
              <div style={{ marginTop: 16 }}>
                <div className="detail-list-meta">Activities</div>
                <div className="detail-activities">
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
        </DetailSection>
      )}

      <DetailSection id="territory" kicker={`0${sectionNum++} · Territory`} title="Service Territory">
        <DetailMap loading={territoryLoading}>
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
        </DetailMap>
      </DetailSection>

      {hasGridRelationships && (
        <DetailSection id="grid" kicker={`0${sectionNum++} · Grid`} title="Grid Relationships">
          <DetailRelationships
            items={[
              ...(iso ? [{ label: "ISO", name: iso.shortName, href: `/explore?view=iso&slug=${iso.slug}` }] : []),
              ...(rto ? [{ label: "RTO", name: rto.shortName, href: `/explore?view=rto&slug=${rto.slug}` }] : []),
              ...(ba
                ? [{ label: "Balancing Authority", name: ba.shortName, href: `/balancing-authorities/${ba.slug}` }]
                : []),
            ]}
          />
        </DetailSection>
      )}

      {hasUtilityRelationships && (
        <DetailSection id="relationships" kicker={`0${sectionNum++} · Relationships`} title="Utility Relationships">
          <DetailRelationships
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
        </DetailSection>
      )}

      {servedRows.length > 0 && (
        <DetailSection id="served" kicker={`0${sectionNum++} · Served`} title="Served Utilities">
          <div className="detail-table-meta">
            {servedRows.length} utilit{servedRows.length !== 1 ? "ies" : "y"}
          </div>
          <div className="detail-table-wrap">
            <DataTable
              data={servedRows}
              columns={utilityColumns}
              mobileBreakpoint="md"
              isLoading={false}
              onRowClick={handleRowClick}
            />
          </div>
        </DetailSection>
      )}

      {childRows.length > 0 && (
        <DetailSection id="subsidiaries" kicker={`0${sectionNum++} · Subsidiaries`} title="Subsidiary Utilities">
          <div className="detail-table-meta">
            {childRows.length} subsidiar{childRows.length !== 1 ? "ies" : "y"}
          </div>
          <div className="detail-table-wrap">
            <DataTable
              data={childRows}
              columns={utilityColumns}
              mobileBreakpoint="md"
              isLoading={false}
              onRowClick={handleRowClick}
            />
          </div>
        </DetailSection>
      )}

      {!programsLoading && utilityPrograms.length > 0 && (
        <DetailSection id="programs" kicker={`0${sectionNum++} · Programs`} title="Programs">
          <div className="detail-list-meta">
            {utilityPrograms.length} program{utilityPrograms.length !== 1 ? "s" : ""}
          </div>
          <DetailEntityList
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
        </DetailSection>
      )}

      {!linesLoading && utilityLines.length > 0 && (
        <DetailSection id="transmission" kicker={`0${sectionNum++} · Transmission`} title="Transmission Lines">
          <DetailFieldList
            items={[
              { id: "lineCount", label: "Total Lines", value: utilityLines.length.toLocaleString() },
              { id: "totalMiles", label: "Total Miles", value: Math.round(linesTotalMiles).toLocaleString() },
              {
                id: "voltageRange",
                label: "Voltage Range",
                value: (() => {
                  const voltages = utilityLines.map((l) => l.voltage).filter((v): v is number => v !== null && v > 0);
                  if (voltages.length === 0) return null;
                  const min = Math.min(...voltages);
                  const max = Math.max(...voltages);
                  return min === max ? `${min} kV` : `${min}–${max} kV`;
                })(),
              },
            ]}
            columns={2}
            enableInlineEdit
            entityType="utility"
            entityId={utility.id}
            entityName={utility.name}
            currentValues={utility as unknown as Record<string, unknown>}
            onFieldEdited={() => {
              window.location.reload();
            }}
          />
        </DetailSection>
      )}

      {!plantsLoading && utilityPowerPlants.length > 0 && (
        <DetailSection id="power-plants" kicker={`0${sectionNum++} · Power Plants`} title="Power Plants">
          <DetailEntityList
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
        </DetailSection>
      )}
    </DetailPageShell>
  );
}
