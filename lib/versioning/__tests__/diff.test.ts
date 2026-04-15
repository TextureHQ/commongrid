/**
 * Unit tests for the JSONB diff engine (computeDelta).
 * Run with: npx tsx lib/versioning/__tests__/diff.test.ts
 */

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
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
      }
    },
  };
}

console.log("\ncomputeDelta");

test("returns null when objects are identical", () => {
  const obj = { a: 1, b: "hello", c: true };
  expect(computeDelta(obj, { ...obj })).toBeNull();
});

test("detects changed field values", () => {
  const prev = { name: "Alice", age: 30 };
  const curr = { name: "Alice", age: 31 };
  expect(computeDelta(prev, curr)).toEqual({ age: 31 });
});

test("detects added fields", () => {
  const prev = { name: "Alice" };
  const curr = { name: "Alice", email: "alice@example.com" };
  expect(computeDelta(prev, curr)).toEqual({ email: "alice@example.com" });
});

test("detects deleted fields as __deleted marker", () => {
  const prev = { name: "Alice", email: "alice@example.com" };
  const curr = { name: "Alice" };
  expect(computeDelta(prev, curr)).toEqual({ email: DELETED_MARKER });
});

test("handles multiple changes simultaneously", () => {
  const prev = { a: 1, b: 2, c: 3 };
  const curr = { a: 10, c: 3, d: 4 };
  expect(computeDelta(prev, curr)).toEqual({
    a: 10,
    b: DELETED_MARKER,
    d: 4,
  });
});

test("handles null values — setting field to null is a change", () => {
  const prev = { value: 42 };
  const curr = { value: null };
  expect(computeDelta(prev, curr)).toEqual({ value: null });
});

test("handles null values — null to value is a change", () => {
  const prev = { value: null };
  const curr = { value: 42 };
  expect(computeDelta(prev as Record<string, unknown>, curr)).toEqual({ value: 42 });
});

test("null to null is not a change", () => {
  const prev = { value: null };
  const curr = { value: null };
  expect(computeDelta(prev as Record<string, unknown>, curr as Record<string, unknown>)).toBeNull();
});

test("detects array changes", () => {
  const prev = { tags: ["a", "b"] };
  const curr = { tags: ["a", "b", "c"] };
  expect(computeDelta(prev, curr)).toEqual({ tags: ["a", "b", "c"] });
});

test("identical arrays return null", () => {
  const prev = { tags: ["a", "b"] };
  const curr = { tags: ["a", "b"] };
  expect(computeDelta(prev, curr)).toBeNull();
});

test("empty array to non-empty array is a change", () => {
  const prev = { tags: [] as string[] };
  const curr = { tags: ["a"] };
  expect(computeDelta(prev, curr)).toEqual({ tags: ["a"] });
});

test("detects nested object changes (full replacement)", () => {
  const prev = { meta: { color: "red", size: 10 } };
  const curr = { meta: { color: "blue", size: 10 } };
  // Nested objects get full replacement, not deep diff
  expect(computeDelta(prev, curr)).toEqual({
    meta: { color: "blue", size: 10 },
  });
});

test("identical nested objects return null", () => {
  const prev = { meta: { color: "red" } };
  const curr = { meta: { color: "red" } };
  expect(computeDelta(prev, curr)).toBeNull();
});

test("handles empty previous object", () => {
  const prev = {};
  const curr = { a: 1, b: 2 };
  expect(computeDelta(prev, curr)).toEqual({ a: 1, b: 2 });
});

test("handles empty current object", () => {
  const prev = { a: 1, b: 2 };
  const curr = {};
  expect(computeDelta(prev, curr)).toEqual({
    a: DELETED_MARKER,
    b: DELETED_MARKER,
  });
});

test("both empty returns null", () => {
  expect(computeDelta({}, {})).toBeNull();
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
