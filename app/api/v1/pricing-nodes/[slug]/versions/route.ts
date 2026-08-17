/**
 * GET /api/v1/pricing-nodes/:slug/versions — version history.
 *
 * Shape and behaviour live in the shared factory; see
 * lib/api/versions-route.ts.
 */
import { createVersionsRoute } from "@/lib/api/versions-route";

export const GET = createVersionsRoute({
  entityType: "pricing_node",
  label: "Pricing node",
  cacheTag: "pricing-node",
  apiSegment: "pricing-nodes",
});
