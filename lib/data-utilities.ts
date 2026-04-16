/**
 * Server-side utilities data access.
 *
 * This module is separated from lib/data.ts so that client components
 * importing other data (ISOs, RTOs, BAs, programs) from lib/data.ts
 * don't pull in the 3.1 MB utilities JSON into the client bundle.
 *
 * For client-side access, use lib/utilities-client.ts instead.
 */

import utilitiesData from "@/data/utilities.json";
import type { Utility } from "@/types/entities";

const utilities: Utility[] = utilitiesData as Utility[];

export function getAllUtilities(): Utility[] {
  return utilities;
}

export function getUtilityBySlug(slug: string): Utility | undefined {
  return utilities.find((u) => u.slug === slug);
}

export function getUtilityById(id: string): Utility | undefined {
  return utilities.find((u) => u.id === id);
}

export function getUtilitiesByIso(isoId: string): Utility[] {
  return utilities.filter((u) => u.isoId === isoId);
}

export function getUtilitiesByRto(rtoId: string): Utility[] {
  return utilities.filter((u) => u.rtoId === rtoId);
}

export function getUtilitiesByBalancingAuthority(baId: string): Utility[] {
  return utilities.filter((u) => u.balancingAuthorityId === baId);
}

export function getUtilitiesByGenerationProvider(providerId: string): Utility[] {
  return utilities.filter((u) => u.generationProviderId === providerId);
}

export function getUtilitiesByTransmissionProvider(providerId: string): Utility[] {
  return utilities.filter((u) => u.transmissionProviderId === providerId);
}

export function getUtilitiesByParent(parentId: string): Utility[] {
  return utilities.filter((u) => u.parentId === parentId);
}
