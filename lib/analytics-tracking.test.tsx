// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsTracking } from "@/components/AnalyticsTracking";

const state = vi.hoisted(() => ({
  pathname: "/",
  user: null as { id: string } | null,
  listener: undefined as undefined | ((resources: unknown) => void),
  unsubscribe: vi.fn(),
}));
const analytics = vi.hoisted(() => ({
  captureEvent: vi.fn(),
  identifyAnalyticsUser: vi.fn(),
  initializeGA: vi.fn(),
  trackCompletedSignUp: vi.fn(),
}));
vi.mock("@/lib/analytics", () => analytics);
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
const clerk = {
  loaded: true,
  client: { signUp: undefined },
  addListener: (listener: (resources: unknown) => void) => {
    state.listener = listener;
    return state.unsubscribe;
  },
};
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => clerk,
  useUser: () => ({ isLoaded: true, user: state.user }),
}));
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.pathname = "/";
  state.user = null;
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("root analytics listener", () => {
  it("retains completed signup until its session activates, without counting returning logins", () => {
    act(() => root.render(<AnalyticsTracking />));
    const signup = { status: "complete", createdUserId: "new-user", createdSessionId: "new-session" };
    act(() => state.listener?.({ client: { signUp: signup }, session: null, user: null }));
    expect(analytics.trackCompletedSignUp).not.toHaveBeenCalled();
    act(() => state.listener?.({ client: {}, session: { id: "returning-session" }, user: { id: "old-user" } }));
    expect(analytics.trackCompletedSignUp).not.toHaveBeenCalled();
    act(() => state.listener?.({ client: {}, session: { id: "new-session" }, user: { id: "new-user" } }));
    expect(analytics.identifyAnalyticsUser).toHaveBeenLastCalledWith({ id: "new-user" });
    expect(analytics.trackCompletedSignUp).toHaveBeenCalledExactlyOnceWith(signup);
    act(() => state.listener?.({ client: {}, session: { id: "new-session" }, user: { id: "new-user" } }));
    expect(analytics.trackCompletedSignUp).toHaveBeenCalledTimes(1);
  });

  it("counts each pathname transition once, including back navigation, and cleans up listeners", () => {
    act(() =>
      root.render(
        <React.StrictMode>
          <AnalyticsTracking />
        </React.StrictMode>
      )
    );
    expect(analytics.captureEvent).toHaveBeenCalledExactlyOnceWith("page_view");
    act(() =>
      root.render(
        <React.StrictMode>
          <AnalyticsTracking />
        </React.StrictMode>
      )
    );
    expect(analytics.captureEvent).toHaveBeenCalledTimes(1);
    state.pathname = "/developers";
    act(() =>
      root.render(
        <React.StrictMode>
          <AnalyticsTracking />
        </React.StrictMode>
      )
    );
    state.pathname = "/";
    act(() =>
      root.render(
        <React.StrictMode>
          <AnalyticsTracking />
        </React.StrictMode>
      )
    );
    expect(analytics.captureEvent).toHaveBeenCalledTimes(3);
    expect(state.unsubscribe).toHaveBeenCalled();
  });
});
