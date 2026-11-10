import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushTelemetry, withCronMonitor } from "./observability";

const { events, flush } = vi.hoisted(() => ({
  events: [] as string[],
  flush: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  flush,
  // Match the SDK's ordering: the terminal check-in is queued AFTER the
  // callback settles, not when the callback flushes its own error reports.
  withMonitor: vi.fn(async (_slug, job) => {
    events.push("in_progress");
    try {
      const result = await job();
      events.push("ok");
      return result;
    } catch (error) {
      events.push("error");
      throw error;
    }
  }),
}));

const options = { slug: "cron-notification-retry", schedule: "*/30 * * * *" };

beforeEach(() => {
  events.length = 0;
  vi.clearAllMocks();
  flush.mockReset().mockImplementation(async () => {
    events.push("flush");
    return true;
  });
});

describe("withCronMonitor", () => {
  it("flushes after the terminal check-in, even when the job already flushed", async () => {
    const response = Response.json({ status: "ok", retried: 0 });
    const result = await withCronMonitor(options, async () => {
      await flushTelemetry();
      return response;
    });

    expect(result).toBe(response);
    expect(events).toEqual(["in_progress", "flush", "ok", "flush"]);
    expect(flush).toHaveBeenLastCalledWith(2000);
  });

  it("flushes early-return/skipped runs and retains the monitor configuration", async () => {
    const response = Response.json({ status: "skipped" });
    expect(
      await withCronMonitor({ ...options, checkinMarginMinutes: 15, maxRuntimeMinutes: 10 }, async () => response)
    ).toBe(response);
    expect(events).toEqual(["in_progress", "ok", "flush"]);
    expect(Sentry.withMonitor).toHaveBeenCalledWith(options.slug, expect.any(Function), {
      schedule: { type: "crontab", value: options.schedule },
      checkinMargin: 15,
      maxRuntime: 10,
      timezone: "Etc/UTC",
    });
  });

  it("flushes rejected jobs without replacing the original error", async () => {
    const error = new Error("database unavailable");
    await expect(
      withCronMonitor(options, async () => {
        throw error;
      })
    ).rejects.toBe(error);
    expect(events).toEqual(["in_progress", "error", "flush"]);
  });

  it("flushes synchronous throws too", async () => {
    const error = new Error("configuration failure");
    await expect(
      withCronMonitor(options, () => {
        throw error;
      })
    ).rejects.toBe(error);
    expect(events).toEqual(["in_progress", "error", "flush"]);
  });

  it("waits for terminal telemetry before resolving the request", async () => {
    let finishFlush: (() => void) | undefined;
    flush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFlush = resolve;
        })
    );
    const settled = vi.fn();
    const result = withCronMonitor(options, async () => "done").then(settled);
    await vi.waitFor(() => expect(flush).toHaveBeenCalled());
    expect(settled).not.toHaveBeenCalled();
    finishFlush?.();
    await result;
    expect(settled).toHaveBeenCalledWith("done");
  });

  it("does not let failed telemetry replace a successful result or job error", async () => {
    flush.mockRejectedValue(new Error("telemetry unavailable"));
    await expect(withCronMonitor(options, async () => "done")).resolves.toBe("done");
    const error = new Error("job failed");
    await expect(
      withCronMonitor(options, async () => {
        throw error;
      })
    ).rejects.toBe(error);
  });
});
