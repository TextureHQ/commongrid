"use client";

import { EntityDetailSkeleton } from "./EntityDetailSkeleton";
import { useDelayedBoolean } from "./useDelayedBoolean";

interface DelayedEntityDetailSkeletonProps {
  delayMs?: number;
}

export function DelayedEntityDetailSkeleton({ delayMs = 120 }: DelayedEntityDetailSkeletonProps) {
  const show = useDelayedBoolean(true, delayMs);

  if (!show) return null;

  return <EntityDetailSkeleton />;
}
