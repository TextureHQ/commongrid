/**
 * GET /api/v1/isos/:slug/versions — version history.
 *
 * Shape and behaviour live in the shared factory; see
 * lib/api/versions-route.ts.
 */
import { createVersionsRoute } from "@/lib/api/versions-route";

export const GET = createVersionsRoute({
  entityType: "iso",
  label: "ISO",
  cacheTag: "iso",
  apiSegment: "isos",
});
