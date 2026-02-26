"use client";

import { useState, useEffect } from "react";
import type { PricingNode } from "@/types/pricing-nodes";

/**
 * Pricing node data is loaded via fetch (not static import) to avoid
 * bundling a large JSON into Next.js pre-rendered pages.
 *
 * The JSON is served from /data/pricing-nodes.json (copied to public/
 * at build time). The browser caches it after first load.
 */

let cachedNodes: PricingNode[] | null = null;
let fetchPromise: Promise<PricingNode[]> | null = null;

async function fetchPricingNodes(): Promise<PricingNode[]> {
  if (cachedNodes) return cachedNodes;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/data/pricing-nodes.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load pricing nodes: ${res.status}`);
      return res.json();
    })
    .then((data: PricingNode[]) => {
      cachedNodes = data;
      return data;
    });

  return fetchPromise;
}

interface UsePricingNodesResult {
  nodes: PricingNode[];
  isLoading: boolean;
  error: string | null;
}

/**
 * React hook to load all pricing nodes client-side.
 * Data is cached in memory after first fetch.
 */
export function usePricingNodes(): UsePricingNodesResult {
  const [nodes, setNodes] = useState<PricingNode[]>(cachedNodes ?? []);
  const [isLoading, setIsLoading] = useState(!cachedNodes);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedNodes) {
      setNodes(cachedNodes);
      setIsLoading(false);
      return;
    }

    fetchPricingNodes()
      .then((data) => {
        setNodes(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  return { nodes, isLoading, error };
}

/**
 * Hook to load a single pricing node by slug.
 */
export function usePricingNode(slug: string): { node: PricingNode | null; isLoading: boolean } {
  const { nodes, isLoading } = usePricingNodes();
  const node = nodes.find((n) => n.slug === slug) ?? null;
  return { node, isLoading };
}
