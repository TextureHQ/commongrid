/**
 * Power plant detail page: /power-plants/[slug]
 *
 * Thin server wrapper around the client detail view. Its only job is to make
 * EIA-plant-code URLs work: `/power-plants/2503` permanently redirects to the
 * canonical slug URL (`/power-plants/59th-street-ny`).
 *
 * Why bother: EIA plant codes are the industry-standard identifier for a
 * generating facility, so they're what people have in hand when they arrive
 * from an EIA-860 filing, an ISO/RTO node registry, or a spreadsheet. Before
 * this redirect existed, those URLs 404'd — and so did CommonGrid's own
 * pricing-node → power-plant links, which are keyed on the EIA code.
 *
 * Plant codes are pure digits and slugs always contain letters, so the check
 * is unambiguous and non-numeric slugs skip the DB hop entirely.
 */

import { permanentRedirect } from "next/navigation";
import { isPlantCode, loadPowerPlantSlugByPlantCode } from "@/lib/data/power-plants-api";
import { PowerPlantDetailClient } from "./PowerPlantDetailClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PowerPlantDetailPage({ params }: Props) {
  const { slug } = await params;

  if (isPlantCode(slug)) {
    const canonicalSlug = await loadPowerPlantSlugByPlantCode(slug);
    // Unknown code falls through to the client view, which renders the
    // standard 404 for a slug that doesn't resolve.
    if (canonicalSlug) {
      permanentRedirect(`/power-plants/${canonicalSlug}`);
    }
  }

  return <PowerPlantDetailClient />;
}
