"use client";

import { Badge, Card, Section } from "@texturehq/edges";
import { useExplorer } from "../ExplorerContext";
import { getAllUtilities, getProgramBySlug } from "@/lib/data";
import {
  AssetTypeLabel,
  CompensationTypeLabel,
  CompensationUnitLabel,
  GridServiceLabel,
  MarketSegmentLabel,
  ParticipationModelLabel,
  ProgramOrganizationRole,
  ProgramStatus,
} from "@/types/programs";
import { safeHostname } from "@/lib/geo";

export function ProgramDetailPanel({ slug }: { slug: string }) {
  const { goBack, navigateToDetail } = useExplorer();

  const program = getProgramBySlug(slug);
  const utilities = getAllUtilities();

  if (!program) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-none px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={goBack}
            className="text-sm text-text-muted hover:text-text-body transition-colors mb-2"
          >
            &larr; Back
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-text-muted">Program not found</div>
      </div>
    );
  }

  const adminOrgs = program.organizations.filter((o) => o.role === ProgramOrganizationRole.ADMINISTRATOR);
  const adminUtilities = adminOrgs
    .map((o) => utilities.find((u) => u.slug === o.entityId))
    .filter(Boolean);

  function getStatusVariant(status: string): "success" | "warning" | "default" {
    if (status === ProgramStatus.ACTIVE) return "success";
    if (status === ProgramStatus.PAUSED || status === ProgramStatus.FULL) return "warning";
    return "default";
  }

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      ACTIVE: "Active",
      PAUSED: "Paused",
      FULL: "Full",
      DRAFT: "Draft",
      ARCHIVED: "Archived",
    };
    return labels[status] ?? status;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-none px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={goBack}
          className="text-sm text-text-muted hover:text-text-body transition-colors mb-2"
        >
          &larr; Back
        </button>
      </div>

      <div className="px-4 pb-6 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-text-heading leading-tight">{program.name}</h2>
            <Badge
              size="sm"
              shape="pill"
              variant={getStatusVariant(program.status)}
            >
              {getStatusLabel(program.status)}
            </Badge>
          </div>
          {program.description && (
            <p className="text-sm text-text-muted mt-2 leading-relaxed">{program.description}</p>
          )}
        </div>

        {/* Overview */}
        <Section id="overview" title="Overview">
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-1 gap-4">
                {/* Administering Utilities */}
                {adminUtilities.length > 0 && (
                  <div>
                    <div className="text-xs text-text-muted mb-1">Administrator</div>
                    <div className="flex flex-col gap-1">
                      {adminUtilities.map((u) =>
                        u ? (
                          <button
                            key={u.slug}
                            type="button"
                            onClick={() => navigateToDetail("utility", u.slug)}
                            className="text-sm font-medium text-brand-primary hover:underline text-left"
                          >
                            {u.name}
                          </button>
                        ) : null
                      )}
                    </div>
                  </div>
                )}

                {/* Regions */}
                {program.regions.length > 0 && (
                  <div>
                    <div className="text-xs text-text-muted mb-1">Regions</div>
                    <div className="flex flex-wrap gap-1">
                      {program.regions.map((r) => (
                        <Badge key={r} size="sm" shape="pill" variant="default">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Website */}
                {program.programWebsite && (
                  <div>
                    <div className="text-xs text-text-muted mb-1">Website</div>
                    <a
                      href={program.programWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-brand-primary hover:underline"
                    >
                      {safeHostname(program.programWebsite)}
                    </a>
                  </div>
                )}
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Asset Types & Segments */}
        <Section id="eligibility" title="Eligibility">
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <div className="text-xs text-text-muted mb-1">Asset Types</div>
                  <div className="flex flex-wrap gap-1">
                    {program.assetTypes.map((at) => (
                      <Badge key={at} size="sm" shape="pill" variant="info">
                        {AssetTypeLabel[at as keyof typeof AssetTypeLabel] ?? at}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-1">Market Segments</div>
                  <div className="flex flex-wrap gap-1">
                    {program.marketSegments.map((ms) => (
                      <Badge key={ms} size="sm" shape="pill" variant="default">
                        {MarketSegmentLabel[ms as keyof typeof MarketSegmentLabel] ?? ms}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Grid Services */}
        <Section id="grid-services" title="Grid Services">
          <Card variant="outlined">
            <Card.Content>
              <div className="flex flex-wrap gap-1">
                {program.gridServices.map((gs) => (
                  <Badge key={gs} size="sm" shape="pill" variant="warning">
                    {GridServiceLabel[gs as keyof typeof GridServiceLabel] ?? gs}
                  </Badge>
                ))}
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Participation */}
        <Section id="participation" title="Participation">
          <Card variant="outlined">
            <Card.Content>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <div className="text-xs text-text-muted mb-1">Participation Models</div>
                  <div className="flex flex-wrap gap-1">
                    {program.participationModels.map((pm) => (
                      <Badge key={pm} size="sm" shape="pill" variant="default">
                        {ParticipationModelLabel[pm as keyof typeof ParticipationModelLabel] ?? pm}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Compensation */}
        {program.compensationTiers.length > 0 && (
          <Section id="compensation" title="Compensation">
            <Card variant="outlined">
              <Card.Content>
                <div className="flex flex-col gap-3">
                  {program.compensationTiers.map((tier) => (
                    <div key={tier.tier} className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-text-body">
                          ${tier.amount}{" "}
                          <span className="text-text-muted font-normal">
                            {CompensationUnitLabel[tier.unit as keyof typeof CompensationUnitLabel] ?? tier.unit}
                          </span>
                        </div>
                        {tier.description && (
                          <div className="text-xs text-text-muted mt-0.5">{tier.description}</div>
                        )}
                      </div>
                      <Badge size="sm" shape="pill" variant="default">
                        {CompensationTypeLabel[tier.type as keyof typeof CompensationTypeLabel] ?? tier.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}

        {/* Links */}
        {(program.faqUrl || program.termsUrl || program.contactUrl) && (
          <Section id="links" title="Links">
            <Card variant="outlined">
              <Card.Content>
                <div className="flex flex-col gap-2">
                  {program.faqUrl && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">FAQ</span>
                      <a
                        href={program.faqUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {safeHostname(program.faqUrl)}
                      </a>
                    </div>
                  )}
                  {program.termsUrl && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Terms</span>
                      <a
                        href={program.termsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {safeHostname(program.termsUrl)}
                      </a>
                    </div>
                  )}
                  {program.contactUrl && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Contact</span>
                      <a
                        href={program.contactUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-primary hover:underline"
                      >
                        {safeHostname(program.contactUrl)}
                      </a>
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          </Section>
        )}
      </div>
    </div>
  );
}
