/**
 * GET /api/v1/rtos/:slug/versions — version history.
 *
 * Shape and behaviour live in the shared factory so every entity type
 * stays identical; see lib/api/versions-route.ts.
 */
import { createVersionsRoute } from "@/lib/api/versions-route";

export const GET = createVersionsRoute({
  entityType: "rto",
  label: "RTO",
});
