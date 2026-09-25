// @vitest-environment jsdom
import posthog from "posthog-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), get_property: vi.fn(), reset: vi.fn(), identify: vi.fn() },
}));

type AnalyticsWindow = Window & { dataLayer?: IArguments[] };
const commands = () => ((window as AnalyticsWindow).dataLayer ?? []).map((command) => Array.from(command));
const events = () => commands().filter((command) => command[0] === "event");

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  localStorage.clear();
  delete (window as AnalyticsWindow).dataLayer;
  window.history.replaceState({}, "", "/");
});

describe("shared conversion contract", () => {
  it("queues one GA initialization without automatic pageviews", async () => {
    const { initializeGA } = await import("./analytics");
    initializeGA();
    initializeGA();
    expect(commands()).toHaveLength(2);
    expect(commands()[1]).toEqual(["config", "G-TEST", expect.objectContaining({ send_page_view: false })]);
  });

  it("records only completed Clerk signups once, including across reloads", async () => {
    const { trackCompletedSignUp } = await import("./analytics");
    const signup = { status: "complete", createdUserId: "user_new", createdSessionId: "session_new" };
    trackCompletedSignUp(undefined); // Returning login has no completed signup.
    trackCompletedSignUp({ ...signup, status: "missing_requirements" });
    trackCompletedSignUp({ ...signup, createdSessionId: null });
    expect(events()).toHaveLength(0);
    trackCompletedSignUp(signup);
    trackCompletedSignUp(signup);
    vi.resetModules();
    (await import("./analytics")).trackCompletedSignUp(signup);
    expect(events()).toHaveLength(1);
    expect(events()[0][1]).toBe("sign_up");
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith("sign_up", {});
  });

  it.each([
    ["/api/v1/developer/keys", "api_key_created"],
    ["/api/v1/contributions", "contribution_submitted"],
  ])("tracks successful %s once without consuming the caller's response or leaking fields", async (url, name) => {
    const { conversionFetch } = await import("./analytics");
    const body = { data: { id: "resource-123", key: "cg_secret", changes: { email: "private@example.org" } } };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(body, { status: 201 })))
    );
    const response = await conversionFetch(url, { method: "POST" });
    await conversionFetch(url, { method: "POST" });
    expect(await response.json()).toEqual(body);
    expect(events()).toHaveLength(1);
    expect(events()[0][1]).toBe(name);
    expect(JSON.stringify(commands())).not.toMatch(/cg_secret|private@|resource-123/);
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith(name, {});
  });

  it.each([400, 401, 409, 429, 500, 200])("does not count response status %s", async (status) => {
    const { conversionFetch } = await import("./analytics");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ data: { id: "x" } }, { status })))
    );
    await conversionFetch("/api/v1/contributions", { method: "POST" });
    expect(events()).toHaveLength(0);
  });

  it("does not count PATCH resubmissions or unrelated endpoints", async () => {
    const { conversionFetch } = await import("./analytics");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ data: { id: "x" } }, { status: 201 })))
    );
    await conversionFetch("/api/v1/contributions/123", { method: "PATCH" });
    await conversionFetch("/api/v1/developer/keys", { method: "DELETE" });
    expect(events()).toHaveLength(0);
  });

  it("keeps failed requests and malformed responses intact", async () => {
    const { conversionFetch } = await import("./analytics");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    await expect(conversionFetch("/api/v1/contributions", { method: "POST" })).rejects.toThrow("offline");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("not-json", { status: 201 })))
    );
    expect(await (await conversionFetch("/api/v1/contributions", { method: "POST" })).text()).toBe("not-json");
    expect(events()).toHaveLength(0);
  });

  it("survives blocked storage and vendor failures", async () => {
    const { trackCompletedSignUp } = await import("./analytics");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    vi.mocked(posthog.capture).mockImplementation(() => {
      throw new Error("SDK error");
    });
    const signup = { status: "complete", createdUserId: "user_new", createdSessionId: "session_new" };
    expect(() => {
      trackCompletedSignUp(signup);
      trackCompletedSignUp(signup);
    }).not.toThrow();
    expect(events()).toHaveLength(1);
  });

  it("is safe with neither vendor configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { captureEvent, identifyAnalyticsUser } = await import("./analytics");
    captureEvent("page_view");
    identifyAnalyticsUser(null);
    expect(commands()).toHaveLength(0);
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });
});

describe("identity and privacy", () => {
  it("preserves anonymous PostHog IDs, resets only identified account transitions, and excludes PII from GA", async () => {
    const { identifyAnalyticsUser } = await import("./analytics");
    identifyAnalyticsUser(null);
    expect(posthog.reset).not.toHaveBeenCalled();
    const user = { id: "user_a", fullName: "Example Person", primaryEmailAddress: { emailAddress: "a@example.org" } };
    identifyAnalyticsUser(user);
    expect(posthog.reset).not.toHaveBeenCalled();
    expect(posthog.identify).toHaveBeenCalledWith("user_a", { $email: "a@example.org", $name: "Example Person" });
    vi.mocked(posthog.get_property).mockReturnValue("user_a");
    identifyAnalyticsUser(user); // reload, same account
    expect(posthog.reset).not.toHaveBeenCalled();
    identifyAnalyticsUser({ id: "user_b" });
    expect(posthog.reset).toHaveBeenCalledTimes(1);
    identifyAnalyticsUser(null);
    expect(posthog.reset).toHaveBeenCalledTimes(2);
    expect(commands().at(-1)).toEqual(["set", { user_id: null }]);
    expect(JSON.stringify(commands())).not.toMatch(/a@example|Example Person/);
  });

  it("strips sensitive URL data while preserving explicit campaign attribution", async () => {
    window.history.replaceState(
      {},
      "",
      "/sign-up/verify?email=a@example.org&utm_source=newsletter&utm_campaign=launch#secret"
    );
    const { analyticsUrl, initializeGA, captureEvent, sanitizePostHogEvent } = await import("./analytics");
    expect(analyticsUrl(window.location.href)).toBe(`${window.location.origin}/sign-up`);
    initializeGA();
    captureEvent("page_view");
    expect(commands()[1][2]).toMatchObject({ campaign_source: "newsletter", campaign_name: "launch" });
    expect(JSON.stringify(commands())).not.toMatch(/a@example|secret|verify/);
    const sanitized = sanitizePostHogEvent({
      properties: {
        $current_url: window.location.href,
        $set_once: { $initial_current_url: window.location.href },
      },
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/a@example|secret|verify/);
    expect(posthog.capture).toHaveBeenCalledWith("$pageview", {});
  });
});
