import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { publicApiResponse } from "@/middleware";

function request(pathname: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(`https://commongrid.info${pathname}`, init);
}

describe("root middleware public API bypass", () => {
  it("returns public API responses without Clerk auth annotation headers", () => {
    const response = publicApiResponse(request("/api/v1/utilities/resolve"));

    expect(response).not.toBeNull();
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response?.headers.get("X-Clerk-Auth-Reason")).toBeNull();
    expect(response?.headers.get("X-Clerk-Auth-Status")).toBeNull();
  });

  it("short-circuits public API preflights without Clerk auth annotation headers", () => {
    const response = publicApiResponse(
      request("/api/v1/utilities/vermont-electric-cooperative/geometry", { method: "OPTIONS" })
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response?.headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
    expect(response?.headers.get("X-Clerk-Auth-Reason")).toBeNull();
    expect(response?.headers.get("X-Clerk-Auth-Status")).toBeNull();
  });

  it("does not bypass Clerk for authenticated v1 routes", () => {
    const response = publicApiResponse(request("/api/v1/developer/keys"));

    expect(response).toBeNull();
  });

  it("does not bypass Clerk for non-v1 API routes", () => {
    const response = publicApiResponse(request("/api/webhooks/clerk"));

    expect(response).toBeNull();
  });
});
