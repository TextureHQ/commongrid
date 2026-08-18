import { describe, expect, it } from "vitest";
import { parseStatusParam } from "./queue-utils";

describe("parseStatusParam", () => {
  it("returns the status when it is a valid queue status", () => {
    expect(parseStatusParam("approved")).toBe("approved");
    expect(parseStatusParam("changes_requested")).toBe("changes_requested");
    expect(parseStatusParam("auto_approved")).toBe("auto_approved");
  });

  it("falls back to pending for null or unknown status values", () => {
    expect(parseStatusParam(null)).toBe("pending");
    expect(parseStatusParam("banana")).toBe("pending");
    expect(parseStatusParam("")).toBe("pending");
  });
});

describe("ModerationContributionsPage URL filter handling", () => {
  it("uses ?status=approved from the query params", () => {
    const params = new URLSearchParams("?status=approved");
    expect(params.get("status")).toBe("approved");
    expect(parseStatusParam(params.get("status"))).toBe("approved");
  });

  it("falls back to pending when no status param is present", () => {
    const params = new URLSearchParams("");
    expect(parseStatusParam(params.get("status"))).toBe("pending");
  });
});
