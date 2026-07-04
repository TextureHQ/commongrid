"use client";

import { Avatar, Badge, Loader } from "@texturehq/edges";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { EntityPageHeader, EntitySection, RelationshipCards } from "@/components/entity";
import { useBalancingAuthority } from "@/hooks/useBalancingAuthority";
import { useIso } from "@/hooks/useIso";

export default function BalancingAuthorityDetailPage() {
  const params = useParams<{ slug: string }>();
  const { balancingAuthority: ba, isLoading, error } = useBalancingAuthority(params.slug);
  const { iso } = useIso(ba?.isoId ?? null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size={40} />
      </div>
    );
  }

  if (error || !ba) {
    notFound();
  }

  return (
    <>
      <EntityPageHeader
        breadcrumbs={[{ label: "Balancing Authorities", href: "/balancing-authorities" }, { label: ba.name }]}
        entityName={ba.name}
        avatar={<Avatar fullName={ba.name} size="lg" />}
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
      />

      <div className="max-w-[960px] mx-auto px-4 md:px-8 lg:px-12 space-y-12 py-8">
        {iso && (
          <EntitySection id="iso" title="ISO/RTO">
            <RelationshipCards
              items={[
                {
                  label: "ISO/RTO",
                  name: iso.name,
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
