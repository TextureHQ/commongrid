/**
 * GET /api/v1/regions/:slug/versions — version history.
 *
 * Shape and behaviour live in the shared factory; see
 * lib/api/versions-route.ts.
 */
import { createVersionsRoute } from "@/lib/api/versions-route";

export const GET = createVersionsRoute({
  entityType: "region",
  label: "Region",
  cacheTag: "region",
  apiSegment: "regions",
});
