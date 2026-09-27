// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { id: "clerk-user" }, isLoaded: true }),
  SignInButton: () => null,
}));
vi.mock("@/hooks/useCurrentUser", () => {
  const user = { id: "user-1", role: "contributor" };
  return { useCurrentUser: () => ({ user, isLoading: false }) };
});
vi.mock("@/components/contributions/InlineFieldEdit", () => ({ InlineFieldEdit: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/ContentPage", () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    ContentPage: Object.assign(Container, {
      Header: ({ actions }: { actions: ReactNode }) => <div>{actions}</div>,
      Body: Container,
    }),
  };
});
vi.mock("@texturehq/edges", () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Card: Object.assign(Container, { Content: Container }),
    Badge: Container,
    Tooltip: Container,
    Icon: () => null,
    Loader: () => null,
    Confirm: () => null,
    Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => (
      <button type="button" onClick={onPress}>
        {children}
      </button>
    ),
    SegmentedControl: ({
      options,
      onChange,
    }: {
      options: { id: string; label: string }[];
      onChange: (id: string) => void;
    }) => (
      <nav>
        {options.map(({ id, label }) => (
          <button type="button" key={id} onClick={() => onChange(id)}>
            {label}
          </button>
        ))}
      </nav>
    ),
  };
});

import ContributionsDashboard from "./page";

let container: HTMLDivElement;
let root: Root;
let summary = { total: 120, pending: 30, approved: 75 };
const requests: URL[] = [];

function cardValue(label: string) {
  const labelElement = [...container.querySelectorAll("span")].find((el) => el.textContent === label);
  return labelElement?.parentElement?.nextElementSibling?.textContent;
}

async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((el) => el.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  requests.length = 0;
  summary = { total: 120, pending: 30, approved: 75 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      requests.push(url);
      const status = url.searchParams.get("status") ?? "all";
      return {
        ok: true,
        json: async () => ({
          data:
            summary.total === 0
              ? []
              : [
                  {
                    id: status,
                    status,
                    entityType: "utility",
                    entitySlug: `row-${status}`,
                    changes: {},
                    createdAt: new Date().toISOString(),
                  },
                ],
          summary: { ...summary },
        }),
      };
    })
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Contributions summary cards", () => {
  it("keeps full-history cards fixed as every tab filters the list", async () => {
    await act(async () => root.render(<ContributionsDashboard />));
    for (const tab of ["Pending", "Approved", "Returned", "Withdrawn", "All"]) {
      await click(tab);
      const status = tab.toLowerCase();
      expect(container.textContent).toContain(`row-${status}`);
      expect(cardValue("Total")).toBe("120");
      expect(cardValue("Pending")).toBe("30");
      expect(cardValue("Approved")).toBe("75");
      expect(cardValue("Approval Rate")).toBe("63%");
      const params = requests[requests.length - 1]?.searchParams;
      expect(params?.get("status")).toBe(status === "all" ? null : status);
      expect(params?.get("user_id")).toBe("user-1");
      expect(params?.get("include_summary")).toBe("true");
      expect(params?.get("limit")).toBe("50");
    }
  });

  it("refreshes totals from the server even while a status tab is selected", async () => {
    await act(async () => root.render(<ContributionsDashboard />));
    await click("Pending");
    summary = { total: 121, pending: 31, approved: 75 };
    await click("Refresh");
    expect(cardValue("Total")).toBe("121");
    expect(cardValue("Pending")).toBe("31");
    expect(cardValue("Approval Rate")).toBe("62%");
    expect(requests[requests.length - 1]?.searchParams.get("status")).toBe("pending");
  });

  it("shows zero percent for an empty contribution history", async () => {
    summary = { total: 0, pending: 0, approved: 0 };
    await act(async () => root.render(<ContributionsDashboard />));
    expect(cardValue("Total")).toBe("0");
    expect(cardValue("Pending")).toBe("0");
    expect(cardValue("Approved")).toBe("0");
    expect(cardValue("Approval Rate")).toBe("0%");
  });
});
