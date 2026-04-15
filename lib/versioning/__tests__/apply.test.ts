/**
 * Unit tests for version reconstruction (applyDelta, reconstructVersion).
 * Run with: npx tsx lib/versioning/__tests__/apply.test.ts
 */

import { applyDelta, reconstructVersion } from "../apply";
import { computeDelta, DELETED_MARKER } from "../diff";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function sortedJSON(val: unknown): string {
  if (val === null || typeof val !== "object") return JSON.stringify(val);
  if (Array.isArray(val)) return `[${val.map(sortedJSON).join(",")}]`;
  const sorted = Object.keys(val as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${sortedJSON((val as Record<string, unknown>)[k])}`)
    .join(",");
  return `{${sorted}}`;
}

function expect(actual: unknown) {
  return {
    toEqual(expected: unknown) {
      const a = sortedJSON(actual);
      const b = sortedJSON(expected);
      if (a !== b) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

console.log("\napplyDelta");

test("applies changed field values", () => {
  const snapshot = { name: "Alice", age: 30 };
  const delta = { age: 31 };
  expect(applyDelta(snapshot, delta)).toEqual({ name: "Alice", age: 31 });
});

test("applies added fields", () => {
  const snapshot = { name: "Alice" };
  const delta = { email: "alice@example.com" };
  expect(applyDelta(snapshot, delta)).toEqual({
    name: "Alice",
    email: "alice@example.com",
  });
});

test("removes fields marked as __deleted", () => {
  const snapshot = { name: "Alice", email: "alice@example.com" };
  const delta = { email: DELETED_MARKER };
  expect(applyDelta(snapshot, delta)).toEqual({ name: "Alice" });
});

test("does not mutate the original snapshot", () => {
  const snapshot = { name: "Alice", age: 30 };
  const original = { ...snapshot };
  applyDelta(snapshot, { age: 31 });
  expect(snapshot).toEqual(original);
});

test("handles empty delta — returns copy of snapshot", () => {
  const snapshot = { name: "Alice", age: 30 };
  expect(applyDelta(snapshot, {})).toEqual(snapshot);
});

test("applies null field values", () => {
  const snapshot = { name: "Alice", age: 30 };
  const delta = { age: null };
  expect(applyDelta(snapshot, delta as Record<string, unknown>)).toEqual({
    name: "Alice",
    age: null,
  });
});

test("applies array field values", () => {
  const snapshot = { tags: ["a", "b"] };
  const delta = { tags: ["a", "b", "c"] };
  expect(applyDelta(snapshot, delta)).toEqual({ tags: ["a", "b", "c"] });
});

test("applies nested object replacement", () => {
  const snapshot = { meta: { color: "red", size: 10 } };
  const delta = { meta: { color: "blue", size: 10 } };
  expect(applyDelta(snapshot, delta)).toEqual({
    meta: { color: "blue", size: 10 },
  });
});

console.log("\nreconstructVersion");

test("returns unchanged snapshot when deltas is empty", () => {
  const snapshot = { name: "Alice", age: 30 };
  expect(reconstructVersion(snapshot, [])).toEqual(snapshot);
});

test("applies multiple deltas in sequence", () => {
  const snapshot = { name: "Alice", age: 30, city: "NYC" };
  const deltas = [
    { age: 31 },
    { city: "LA" },
    { email: "alice@example.com" },
  ];
  expect(reconstructVersion(snapshot, deltas)).toEqual({
    name: "Alice",
    age: 31,
    city: "LA",
    email: "alice@example.com",
  });
});

test("handles __deleted markers across multiple deltas", () => {
  const snapshot = { a: 1, b: 2, c: 3 };
  const deltas = [
    { b: DELETED_MARKER },
    { a: 10 },
    { d: 4 },
  ];
  expect(reconstructVersion(snapshot, deltas)).toEqual({ a: 10, c: 3, d: 4 });
});

test("later delta can re-add a previously deleted field", () => {
  const snapshot = { name: "Alice", email: "old@example.com" };
  const deltas = [
    { email: DELETED_MARKER },
    { email: "new@example.com" },
  ];
  expect(reconstructVersion(snapshot, deltas)).toEqual({
    name: "Alice",
    email: "new@example.com",
  });
});

console.log("\nRoundtrip: computeDelta → applyDelta");

test("applying delta to previous should equal current", () => {
  const prev = { name: "Alice", age: 30, city: "NYC" };
  const curr = { name: "Alice", age: 31, email: "alice@example.com" };
  const delta = computeDelta(prev, curr);
  if (delta === null) throw new Error("Expected a delta");
  expect(applyDelta(prev, delta)).toEqual(curr);
});

test("roundtrip with deleted fields", () => {
  const prev = { a: 1, b: 2, c: 3 };
  const curr = { a: 1, c: 99, d: 4 };
  const delta = computeDelta(prev, curr);
  if (delta === null) throw new Error("Expected a delta");
  expect(applyDelta(prev, delta)).toEqual(curr);
});

test("roundtrip with array changes", () => {
  const prev = { tags: ["a", "b"], name: "test" };
  const curr = { tags: ["a", "b", "c"], name: "test" };
  const delta = computeDelta(prev, curr);
  if (delta === null) throw new Error("Expected a delta");
  expect(applyDelta(prev, delta)).toEqual(curr);
});

test("roundtrip with nested object changes", () => {
  const prev = { meta: { color: "red", size: 10 }, id: 1 };
  const curr = { meta: { color: "blue", size: 20 }, id: 1 };
  const delta = computeDelta(prev, curr);
  if (delta === null) throw new Error("Expected a delta");
  expect(applyDelta(prev, delta)).toEqual(curr);
});

test("multi-version reconstruction roundtrip", () => {
  const v1 = { name: "Alice", age: 30 };
  const v2 = { name: "Alice", age: 31 };
  const v3 = { name: "Alice", age: 31, city: "NYC" };
  const v4 = { name: "Bob", age: 31, city: "NYC" };

  const d1 = computeDelta(v1, v2)!;
  const d2 = computeDelta(v2, v3)!;
  const d3 = computeDelta(v3, v4)!;

  expect(reconstructVersion(v1, [d1])).toEqual(v2);
  expect(reconstructVersion(v1, [d1, d2])).toEqual(v3);
  expect(reconstructVersion(v1, [d1, d2, d3])).toEqual(v4);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
