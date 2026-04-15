/**
 * API error handling for CommonGrid.
 *
 * Provides a typed `ApiError` class and standard error codes matching
 * the HTTP status mapping in §4.10 of the persistence-api spec.
 */

import type { ApiErrorResponse } from "./types";

// ---------------------------------------------------------------------------
// Standard error codes → HTTP status mapping
// ---------------------------------------------------------------------------

const ERROR_STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

// ---------------------------------------------------------------------------
// ApiError class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code] ?? 500;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Format an error into the standard response envelope
// ---------------------------------------------------------------------------

export function formatError(error: ApiError, requestId: string): ApiErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message,
      request_id: requestId,
      timestamp: new Date().toISOString(),
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  };
}
