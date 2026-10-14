// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDelayedBoolean } from "./useDelayedBoolean";

function TestView({ active, delayMs = 120 }: { active: boolean; delayMs?: number }) {
  const delayed = useDelayedBoolean(active, delayMs);
  return createElement("div", { "data-testid": "value" }, String(delayed));
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("useDelayedBoolean", () => {
  it("stays false until the delay elapses", async () => {
    await act(async () => {
      root.render(createElement(TestView, { active: true, delayMs: 200 }));
    });
    expect(container.textContent).toBe("false");

    await act(async () => {
      vi.advanceTimersByTime(199);
    });
    expect(container.textContent).toBe("false");

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(container.textContent).toBe("true");
  });

  it("resets immediately when active turns false", async () => {
    await act(async () => {
      root.render(createElement(TestView, { active: true, delayMs: 50 }));
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(container.textContent).toBe("true");

    await act(async () => {
      root.render(createElement(TestView, { active: false, delayMs: 50 }));
    });
    expect(container.textContent).toBe("false");
  });
});
