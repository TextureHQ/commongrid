// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useChangelogFeed", () => ({
  useChangelogFeed: () => ({ rows: [], isLoading: false, error: null }),
  useChangelogCounters: () => ({ day: null, week: null }),
}));
vi.mock("@/hooks/useEntityCounts", () => ({
  useEntityCounts: () => new Proxy({}, { get: () => null }),
  formatCount: () => "—",
}));
vi.mock("@texturehq/edges", () => ({ Skeleton: () => null }));

import LandingPage from "./HomePageClient";

function contributionSection() {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<LandingPage />);
  const section = container.querySelector("#contribute");
  expect(section).not.toBeNull();
  return section!;
}

describe("homepage contribution copy", () => {
  it("describes immediate publication on approval and changelog recording", () => {
    const text = contributionSection().textContent;
    expect(text).toContain("Approve & publish");
    expect(text).toContain(
      "Approved edits update the database immediately, making them available on the site and through the API. Each change also appears in the changelog."
    );
  });

  it("does not promise fabricated timings, snapshots, or reversion", () => {
    const section = contributionSection();
    expect(section.textContent).not.toMatch(
      /median|\d+(?:\.\d+)?\s*(?:s\b|h\b|seconds|hours)|snapshot|revert|reversible/i
    );
    expect([...section.querySelectorAll("h4")].map((heading) => heading.textContent)).toEqual([
      "Propose",
      "Review",
      "Approve & publish",
      "Attribute",
      "ODbL 1.0",
    ]);
  });
});
