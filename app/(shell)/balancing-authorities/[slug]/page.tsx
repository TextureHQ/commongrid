"use client";

import { Avatar, Badge, Loader, type StatItem, StatList } from "@texturehq/edges";
import { notFound, useParams } from "next/navigation";
import Link from "next/link";
import { useBalancingAuthority } from "@/hooks/useBalancingAuthority";
import { useIso } from "@/hooks/useIso";
import { EntityPageHeader, EntitySection, RelationshipCards } from "@/components/entity";

export default function BalancingAuthorityDetailPage() {
  const params = useParams<{ slug: string }>();
  const { balancingAuthority: ba, isLoading, error } = useBalancingAuthority(params.slug);
  const { iso } = useIso(ba?.isoId ?? null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="lg" />
      </div>
    );
  }

  if (error || !ba) {
    notFound();
  }

  const stats: StatItem[] = [
    { id: "eia-code", label: "EIA Code", value: ba.eiaCode ?? "—" },
    ...(ba.states?.length
      ? [{ id: "states", label: "States", value: ba.states.join(", ") }]
      : []),
  ];

  return (
    <>
      <EntityPageHeader
        avatar={<Avatar name={ba.name} size="lg" />}
        title={ba.name}
        subtitle={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge>Balancing Authority</Badge>
            {iso && (
              <Link href={`/grid-operators/${iso.slug}`} className="text-sm text-text-muted hover:underline">
                {iso.name}
              </Link>
            )}
          </div>
        }
        stats={<StatList items={stats} />}
      />

      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12 space-y-12 py-8">
        {iso && (
          <EntitySection title="ISO/RTO">
            <RelationshipCards
              items={[
                {
                  id: iso.slug,
                  name: iso.name,
                  type: iso.type,
                  href: `/grid-operators/${iso.slug}`,
                },
              ]}
            />
          </EntitySection>
        )}
      </div>
    </>
  );
}
