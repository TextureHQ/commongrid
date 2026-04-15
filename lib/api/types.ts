/**
 * Shared API types for CommonGrid REST endpoints.
 *
 * These types define the request/response contracts used across all
 * `/api/v1/` routes. See docs/specs/persistence-api.md §4.1–4.2.
 */

/** Where the data is currently sourced from (allows gradual migration). */
export type DataSource = "database" | "json";

/** Authentication context attached to a request after auth middleware runs. */
export interface AuthContext {
  type: "api-key" | "oauth";
  identity: string; // key name or OAuth sub
  scopes: string[];
  metadata: Record<string, unknown>;
}

/** Standard paginated response envelope (§4.2). */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

/** Standard error response envelope (§4.10). */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    request_id: string;
    timestamp: string;
    details?: unknown;
  };
}

/** Shape of a Next.js API route handler with extended context. */
export type RouteHandler = (req: Request, ctx: RouteContext) => Promise<Response>;

/** Extended context passed through middleware chain. */
export interface RouteContext {
  params?: Record<string, string>;
  requestId: string;
}
