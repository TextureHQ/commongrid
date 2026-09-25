import { describe, expect, it } from "vitest";
import { isBrowserRead } from "../browser-traffic";

const hints = {
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  referer: "https://commongrid.info/explore/utilities",
};

function request(headers: Record<string, string> = hints, method = "GET", path = "utilities") {
  return new Request(`https://commongrid.info/api/v1/${path}`, { method, headers });
}

describe("browser traffic classification (not authentication)", () => {
  it("recognizes same-origin fetch and HEAD reads", () => {
    expect(isBrowserRead(request())).toBe(true);
    expect(isBrowserRead(request(hints, "HEAD"))).toBe(true);
    expect(isBrowserRead(request({ ...hints, origin: "https://commongrid.info" }))).toBe(true);
  });

  it("does not classify missing hints or Origin/Referer alone as browser traffic", () => {
    expect(isBrowserRead(request({}))).toBe(false);
    expect(isBrowserRead(request({ origin: "https://commongrid.info", referer: hints.referer }))).toBe(false);
    const { referer: _referer, ...noOrigin } = hints;
    expect(isBrowserRead(request(noOrigin))).toBe(false);
  });

  it.each([
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-mode": "navigate" },
    { "sec-fetch-dest": "document" },
    { origin: "https://commongrid.info.evil.example" },
    { origin: "null" },
    { origin: "http://commongrid.info" },
    { referer: "https://commongrid.info:444/explore" },
    { referer: "not a url" },
    { referer: "https://evil.example/" },
  ])("rejects inconsistent or cross-origin metadata: %j", (override) => {
    expect(isBrowserRead(request({ ...hints, ...override }))).toBe(false);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("never classifies %s writes", (method) => {
    expect(isBrowserRead(request(hints, method))).toBe(false);
  });

  it("excludes bulk endpoints and non-v1 routes", () => {
    expect(isBrowserRead(request(hints, "GET", "utilities/bulk"))).toBe(false);
    expect(isBrowserRead(new Request("https://commongrid.info/api/health", { headers: hints }))).toBe(false);
  });

  it("uses the request origin on preview and local deployments, not a production-only allowlist", () => {
    expect(
      isBrowserRead(
        new Request("http://localhost:3060/api/v1/utilities", {
          headers: { ...hints, referer: "http://localhost:3060/explore" },
        })
      )
    ).toBe(true);
  });
});
