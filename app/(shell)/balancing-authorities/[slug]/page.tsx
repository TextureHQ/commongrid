"use client";

import { Badge, type Column, DataTable, InteractiveMap, layer } from "@texturehq/edges";
import type { FeatureCollection } from "geojson";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EntityActions } from "@/components/contributions/EntityActions";
import {
  DataTableSection,
  EntityList,
  EntityMap,
  EntityPageHeader,
  EntitySection,
  type EntityStat,
  EntityStatsRow,
  FieldList,
  RelationshipCards,
} from "@/components/entity";
import {
  formatCapacity,
  formatCustomerCount,
  formatStates,
  getFuelBadgeVariant,
  getFuelCategoryColor,
  getFuelCategoryLabel,
  getSegmentBadgeVariant,
  getSegmentLabel,
} from "@/lib/formatting";
import { computeViewStateFromGeoJSON, safeHostname } from "@/lib/geo";
import { useBalancingAuthority } from "@/hooks/useBalancingAuthority";
import { useIso } from "@/hooks/useIso";
import { usePowerPlantList } from "@/hooks/usePowerPlantList";
import { useProgramList } from "@/hooks/useProgramList";
import { useUtilityList } from "@/hooks/useUtilityList";

interface UtilityRow extends Record<string, unknown> {
  slug: string;
  name: string;
  segment: string;
  customerCount: number | null;
  jurisdiction: string | null;
}

export default function BADetailPage() {
  const params = useParams<{ slug: string }>();
  const { balancingAuthority: ba, isLoading: baLoading } = useBalancingAuthority(params.slug);

  const [territoryGeoJSON, setTerritoryGeoJSON] = useState<FeatureCollection | null>(null);
  const [territoryLoading, setTerritoryLoading] = useState(true);

  const { iso, isLoading: isoLoading } = useIso(ba?.isoId ?? null);

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

  const { utilities, isLoading: utilitiesLoading } = useUtilityList({ ba: ba?.slug, limit: 200 });
  const { powerPlants: baPowerPlants, isLoading: plantsLoading } = usePowerPlantList({ baId: ba?.id, limit: 200 });

  const { programs: allPrograms, isLoading: programsLoading } = useProgramList({ limit: 200 });
  const baPrograms = useMemo(() => {
    if (!utilities.length || !allPrograms.length) return [];
    const slugs = new Set(utilities.map((u) => u.slug));
    return allPrograms.filter((p) => p.organizations.some((o) => o.entityId && slugs.has(o.entityId)));
  }, [utilities, allPrograms]);

  const totalCustomers = useMemo(() => utilities.reduce((sum, u) => sum + (u.customerCount ?? 0), 0), [utilities]);

  const fuelMix = useMemo(() => {
    if (baPowerPlants.length === 0) return [];
    const byFuel: Record<string, { capacity: number; count: number }> = {};
    for (const plant of baPowerPlants) {
      const cat = plant.fuelCategory;
      if (!byFuel[cat]) byFuel[cat] = { capacity: 0, count: 0 };
      byFuel[cat].capacity += plant.totalCapacityMw;
      byFuel[cat].count++;
    }
    const total = Object.values(byFuel).reduce((s, v) => s + v.capacity, 0);
    return Object.entries(byFuel)
      .map(([fuel, data]) => ({
        fuel: fuel as import("@/types/entities").FuelCategory,
        capacity: data.capacity,
        count: data.count,
        pct: total > 0 ? (data.capacity / total) * 100 : 0,
      }))
      .sort((a, b) => b.capacity - a.capacity);
  }, [baPowerPlants]);

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

  if (baLoading) {
    return (
      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        <div className="flex items-center justify-center py-24">
          <div className="text-text-muted">Loading...</div>
        </div>
      </div>
    );
  }

  if (!ba) {
    notFound();
  }

  // Header stats band — pass raw numbers + formatters
  const headerStats: EntityStat[] = [
    ...(totalCustomers > 0
      ? [
          {
            label: "Total Customers",
            value: totalCustomers,
            formatter: (v) => formatCustomerCount(v as number | null),
          } satisfies EntityStat,
        ]
      : []),
    ...(utilities.length > 0
      ? [
          {
            label: "Utilities",
            value: utilities.length,
            formatter: (v) => (v as number).toLocaleString(),
          } satisfies EntityStat,
        ]
      : []),
    ...(!plantsLoading && baPowerPlants.length > 0
      ? [
          {
            label: "Power Plants",
            value: baPowerPlants.length,
            formatter: (v) => (v as number).toLocaleString(),
          } satisfies EntityStat,
        ]
      : []),
    ...(!plantsLoading && baPowerPlants.length > 0
      ? [
          {
            label: "Total Capacity",
            value: baPowerPlants.reduce((sum, p) => sum + p.totalCapacityMw, 0),
            formatter: (v) => formatCapacity(v as number | null),
          } satisfies EntityStat,
        ]
      : []),
  ];

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
    badge: (
      <Badge size="sm" shape="pill" variant={getFuelBadgeVariant(plant.fuelCategory)}>
        {getFuelCategoryLabel(plant.fuelCategory)}
      </Badge>
    ),
    meta: formatCapacity(plant.totalCapacityMw),
  }));

  const totalPlantCapacity = baPowerPlants.reduce((sum, p) => sum + p.totalCapacityMw, 0);

  return (
    <>
      <EntityPageHeader
        entityName={ba.name}
        subtitle={
          <>
            <span>{ba.shortName}</span>
            {ba.website && (
              <>
                <span className="text-text-muted mx-2">·</span>
                <a href={ba.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
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
      />

      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12">
        {/* Key stats band */}
        {headerStats.length > 0 && <EntityStatsRow stats={headerStats} />}

        {/* Overview */}
        <EntitySection id="overview" title="Overview">
          <FieldList items={overviewFields} columns={2} />
        </EntitySection>

        {/* Territory */}
        <EntitySection id="territory" title="Balancing Authority Region">
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
          </EntityMap>
        </EntitySection>

        {/* Grid Relationships */}
        {gridRelItems.length > 0 && (
          <EntitySection id="grid" title="Grid Relationships">
            <RelationshipCards items={gridRelItems} />
          </EntitySection>
        )}

        {/* Utilities */}
        {utilityRows.length > 0 && (
          <EntitySection id="utilities" title="Utilities">
            <DataTableSection count={utilityRows.length} singularLabel="utility" pluralLabel="utilities">
              <DataTable
                data={utilityRows}
                columns={utilityColumns}
                mobileBreakpoint="md"
                isLoading={false}
                onRowClick={handleRowClick}
              />
            </DataTableSection>
          </EntitySection>
        )}

        {/* Fuel Mix */}
        {!plantsLoading && fuelMix.length > 0 && (
          <EntitySection id="fuel-mix" title="Generation Fuel Mix">
            <FieldList
              items={fuelMix.map((item) => ({
                id: item.fuel,
                label: (
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getFuelCategoryColor(item.fuel) }}
                      aria-hidden="true"
                    />
                    {getFuelCategoryLabel(item.fuel)}
                  </span>
                ),
                value: `${formatCapacity(item.capacity)} · ${item.count} plant${item.count !== 1 ? "s" : ""} · ${item.pct.toFixed(1)}%`,
              }))}
              columns={1}
            />
          </EntitySection>
        )}

        {/* Programs */}
        {!programsLoading && baPrograms.length > 0 && (
          <EntitySection id="programs" title="Programs">
            <EntityList
              items={baPrograms.map((prog) => ({
                href: `/programs/${prog.slug}`,
                name: prog.name,
                badge: (
                  <Badge size="sm" shape="pill" variant={prog.status === "ACTIVE" ? "success" : "neutral"}>
                    {prog.status}
                  </Badge>
                ),
                meta: prog.gridServices.join(", "),
              }))}
              headerMeta={`${baPrograms.length} program${baPrograms.length !== 1 ? "s" : ""} across member utilities`}
            />
          </EntitySection>
        )}

        {/* Power Plants */}
        {!plantsLoading && baPowerPlants.length > 0 && (
          <EntitySection id="power-plants" title="Power Plants">
            <EntityList
              items={plantListItems}
              maxItems={30}
              headerMeta={`${baPowerPlants.length} plant${baPowerPlants.length !== 1 ? "s" : ""} · ${formatCapacity(totalPlantCapacity)} total capacity`}
            />
          </EntitySection>
        )}
      </div>
    </>
  );
}
