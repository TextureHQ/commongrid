"use client";

import "../../detail-page.css";

import { Badge, type Column, DataTable, InteractiveMap, layer } from "@texturehq/edges";
import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EntityActions } from "@/components/contributions/EntityActions";
import { DetailEntityList } from "@/components/detail/DetailEntityList";
import { DetailFieldList } from "@/components/detail/DetailFieldList";
import { DetailMap } from "@/components/detail/DetailMap";
import { DetailPageShell } from "@/components/detail/DetailPageShell";
import { DetailRelationships } from "@/components/detail/DetailRelationships";
import { DetailSection } from "@/components/detail/DetailSection";
import { DetailStatGrid } from "@/components/detail/DetailStatGrid";
import { getBalancingAuthorityBySlug, getIsoById } from "@/lib/data";
import {
  formatCapacity,
  formatCustomerCount,
  formatStates,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getSegmentBadgeVariant,
  getSegmentLabel,
} from "@/lib/formatting";
import { computeViewStateFromGeoJSON, safeHostname } from "@/lib/geo";
import { filterByBA, usePowerPlants } from "@/lib/power-plants";
import { useUtilities } from "@/lib/utilities-client";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

export default function BADetailPage() {
  const params = useParams<{ slug: string }>();
  const ba = getBalancingAuthorityBySlug(params.slug);

  const [territoryGeoJSON, setTerritoryGeoJSON] = useState<FeatureCollection | null>(null);
  const [territoryLoading, setTerritoryLoading] = useState(true);

  const iso = ba?.isoId ? getIsoById(ba.isoId) : null;

  useEffect(() => {
    if (!ba?.regionId) {
      setTerritoryLoading(false);
      return;
    }
    fetch(`/data/territories/ba-${ba.slug}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTerritoryGeoJSON(data as FeatureCollection | null))
      .catch(() => setTerritoryGeoJSON(null))
      .finally(() => setTerritoryLoading(false));
  }, [ba?.slug, ba?.regionId]);

  const { utilities: allUtilities } = useUtilities();
  const utilities = useMemo(
    () => (ba ? allUtilities.filter((u) => u.balancingAuthorityId === ba.id) : []),
    [ba, allUtilities]
  );
  const { plants: allPlants, isLoading: plantsLoading } = usePowerPlants();
  const baPowerPlants = useMemo(() => (ba ? filterByBA(allPlants, ba.id) : []), [ba, allPlants]);

  const utilityRows: UtilityRow[] = useMemo(
    () =>
      utilities.map((u) => ({
        slug: u.slug,
        name: u.name,
        segment: u.segment,
        customerCount: u.customerCount,
        jurisdiction: u.jurisdiction,
      })),
    [utilities]
  );

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
        render: (_value: unknown, row: UtilityRow) => (
          <span className="text-text-body">{formatCustomerCount(row.customerCount)}</span>
        ),
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

  if (!ba) {
    notFound();
  }

  // Header stats band
  const headerStats = [
    ...(utilities.length > 0 ? [{ value: String(utilities.length), label: "Utilities" }] : []),
    ...(!plantsLoading && baPowerPlants.length > 0
      ? [{ value: String(baPowerPlants.length), label: "Power Plants" }]
      : []),
    ...(!plantsLoading && baPowerPlants.length > 0
      ? [
          {
            value: formatCapacity(baPowerPlants.reduce((sum, p) => sum + p.totalCapacityMw, 0)),
            label: "Total Capacity",
          },
        ]
      : []),
    ...(ba.states.length > 0 ? [{ value: String(ba.states.length), label: "States" }] : []),
  ] as { value: string; label: string }[];

  // Overview fields
  const overviewFields = [
    { id: "shortName", label: "Short Name", value: ba.shortName },
    { id: "eiaCode", label: "EIA Code", value: ba.eiaCode ?? null, copyable: true },
    { id: "states", label: "States", value: formatStates(ba.states) },
    ...(ba.website ? [{ id: "website", label: "Website", value: safeHostname(ba.website), href: ba.website }] : []),
  ];

  // Grid relationships
  const gridRelItems = [
    ...(iso ? [{ label: "ISO", name: iso.shortName, href: `/explore?view=iso&slug=${iso.slug}` }] : []),
  ];

  // Power plant entity list items
  const plantListItems = baPowerPlants.slice(0, 30).map((plant) => ({
    href: `/power-plants/${plant.slug}`,
    name: plant.name,
    dotColor: getFuelCategoryColor(plant.fuelCategory),
    badge: <span className="cg-tag">{getFuelCategoryLabel(plant.fuelCategory)}</span>,
    meta: formatCapacity(plant.totalCapacityMw),
  }));

  const totalPlantCapacity = baPowerPlants.reduce((sum, p) => sum + p.totalCapacityMw, 0);

  let sectionNum = 1;
  const nextNum = () => String(sectionNum++).padStart(2, "0");

  return (
    <DetailPageShell
      kicker="Balancing Authority"
      entityName={ba.name}
      subtitle={
        <>
          <span>{ba.shortName}</span>
          {ba.website && (
            <>
              <span className="sep">·</span>
              <a href={ba.website} target="_blank" rel="noopener noreferrer">
                {safeHostname(ba.website)}
              </a>
            </>
          )}
        </>
      }
      breadcrumbs={[{ label: "Grid Operators", href: "/explore?view=grid-operators" }, { label: ba.slug }]}
      actions={
        <EntityActions
          entityType="balancing_authority"
          entityId={ba.id ?? ba.slug}
          entitySlug={ba.slug}
          entityName={ba.name}
          currentValues={ba as unknown as Record<string, unknown>}
        />
      }
      dataSourcePaths={["data/balancing-authorities.json"]}
    >
      {/* Key stats band */}
      {headerStats.length > 0 && <DetailStatGrid stats={headerStats} />}

      {/* 01 · Overview */}
      <DetailSection id="overview" kicker={`${nextNum()} · Overview`} title="Overview">
        <DetailFieldList items={overviewFields} columns={2} />
      </DetailSection>

      {/* 02 · Territory */}
      <DetailSection id="territory" kicker={`${nextNum()} · Territory`} title="Balancing Authority Region">
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
                      id: "ba-territory",
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

      {/* 03 · Grid Relationships */}
      {gridRelItems.length > 0 && (
        <DetailSection id="grid" kicker={`${nextNum()} · Grid`} title="Grid Relationships">
          <DetailRelationships items={gridRelItems} />
        </DetailSection>
      )}

      {/* 04 · Utilities */}
      {utilityRows.length > 0 && (
        <DetailSection id="utilities" kicker={`${nextNum()} · Utilities`} title="Utilities">
          <div className="detail-table-meta">
            {utilityRows.length} utilit{utilityRows.length === 1 ? "y" : "ies"}
          </div>
          <div className="detail-table-wrap">
            <DataTable
              data={utilityRows}
              columns={utilityColumns}
              mobileBreakpoint="md"
              isLoading={false}
              onRowClick={handleRowClick}
            />
          </div>
        </DetailSection>
      )}

      {/* 05 · Power Plants */}
      {!plantsLoading && baPowerPlants.length > 0 && (
        <DetailSection id="power-plants" kicker={`${nextNum()} · Generation`} title="Power Plants">
          <DetailEntityList
            items={plantListItems}
            maxItems={30}
            headerMeta={`${baPowerPlants.length} plant${baPowerPlants.length !== 1 ? "s" : ""} · ${formatCapacity(totalPlantCapacity)} total capacity`}
          />
        </DetailSection>
      )}
    </DetailPageShell>
  );
}
