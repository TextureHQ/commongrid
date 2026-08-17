/**
 * GET /api/v1/ev-stations/:slug/versions — version history.
 *
 * Shape and behaviour live in the shared factory so every entity type
 * stays identical; see lib/api/versions-route.ts.
 */
import { createVersionsRoute } from "@/lib/api/versions-route";

export const GET = createVersionsRoute({
  entityType: "ev_station",
  label: "EV station",
});
