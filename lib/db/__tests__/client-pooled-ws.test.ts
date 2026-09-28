import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for CG-268: the Neon serverless `Pool` connects over a
 * WebSocket, but a `WebSocket` global only exists in browsers/edge runtimes and
 * in Node >= 22. On Node 20 (the sync-workflow CI runners) it is absent, so the
 * pooled client must install the `ws` implementation via
 * `neonConfig.webSocketConstructor` or every pooled query aborts before any
 * work is done. These tests pin that behavior on both runtime shapes.
 *
 * `lib/db/client-pooled.ts` runs the constructor logic at import time, so each
 * case controls `globalThis.WebSocket` and then imports the module fresh.
 */
describe("client-pooled WebSocket constructor (CG-268)", () => {
  const originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    // Importing the pooled client must not require a real database.
    process.env.DATABASE_URL = "";
  });

  afterEach(() => {
    if (originalWebSocket === undefined) {
      delete (globalThis as { WebSocket?: unknown }).WebSocket;
    } else {
      (globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket;
    }
    if (originalDbUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDbUrl;
    }
  });

  it("installs the ws constructor when no global WebSocket exists (Node 20)", async () => {
    // Simulate a runtime with no global WebSocket (e.g. Node 20).
    delete (globalThis as { WebSocket?: unknown }).WebSocket;

    const { neonConfig } = await import("@neondatabase/serverless");
    const ws = (await import("ws")).default;
    // Clear any value a prior import in this worker may have set.
    neonConfig.webSocketConstructor = undefined;

    await import("../client-pooled");

    expect(neonConfig.webSocketConstructor).toBe(ws);
  });

  it("leaves the native WebSocket in place when a global exists (Node 22+/edge)", async () => {
    class FakeWebSocket {}
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;

    const { neonConfig } = await import("@neondatabase/serverless");
    neonConfig.webSocketConstructor = undefined;

    await import("../client-pooled");

    // The module must not override a runtime that already provides WebSocket.
    expect(neonConfig.webSocketConstructor).toBeUndefined();
  });
});
