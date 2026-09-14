import { describe, expect, it } from "vitest";
import { getHumanLockedFields } from "../field-provenance";

interface VersionFixture {
  versionNumber: number;
  snapshot?: unknown;
  delta?: unknown;
  sourceType: string | null;
}

/**
 * A fake reader that satisfies the `Pick<DbTransaction, "select">`
 * surface area that `getHumanLockedFields` actually uses.
 */
function fakeReader(fixtures: VersionFixture[]) {
  const rows = fixtures.map((f) => ({
    versionNumber: f.versionNumber,
    snapshot: f.snapshot ?? null,
    delta: f.delta ?? null,
    sourceType: f.sourceType,
  }));

  return {
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve(rows), {
            orderBy: () => Promise.resolve([...rows].sort((a, b) => b.versionNumber - a.versionNumber)),
          }),
      }),
    }),
  } as unknown as Parameters<typeof getHumanLockedFields>[0];
}

describe("getHumanLockedFields", () => {
  it("treats a field whose newest version is community as locked", async () => {
    const locked = await getHumanLockedFields(
      fakeReader([
        {
          versionNumber: 2,
          delta: { name: { old: "Old", new: "New" } },
          sourceType: "community",
        },
      ]),
      "utility",
      "u-1"
    );

    expect(locked).toEqual(new Set(["name"]));
  });

  it("treats admin and community_override sources as locked", async () => {
    for (const sourceType of ["admin", "community_override"]) {
      const locked = await getHumanLockedFields(
        fakeReader([
          {
            versionNumber: 1,
            snapshot: { name: "Acme" },
            sourceType,
          },
        ]),
        "utility",
        "u-1"
      );

      expect(locked).toEqual(new Set(["name"]));
    }
  });

  it("does not lock a field whose newest touching version is sync, even if an older version was human", async () => {
    const locked = await getHumanLockedFields(
      fakeReader([
        {
          versionNumber: 2,
          delta: { name: { old: "Old", new: "Newer" } },
          sourceType: "sync",
        },
        {
          versionNumber: 1,
          delta: { name: { old: "Original", new: "Old" } },
          sourceType: "community",
        },
      ]),
      "utility",
      "u-1"
    );

    expect(locked).toEqual(new Set([]));
  });

  it("does not lock fields only ever touched by sync or baseline", async () => {
    const locked = await getHumanLockedFields(
      fakeReader([
        {
          versionNumber: 1,
          snapshot: { name: "Acme", customerCount: 5 },
          sourceType: "sync",
        },
      ]),
      "utility",
      "u-1"
    );

    expect(locked).toEqual(new Set([]));
  });

  it("counts every content key in a v1 snapshot as touched by that version's source", async () => {
    const locked = await getHumanLockedFields(
      fakeReader([
        {
          versionNumber: 1,
          snapshot: { name: "Acme", website: "https://acme.test" },
          sourceType: "community",
        },
      ]),
      "utility",
      "u-1"
    );

    expect(locked).toEqual(new Set(["name", "website"]));
  });

  it("ignores bookkeeping keys (createdAt, updatedAt, version, searchVector)", async () => {
    const locked = await getHumanLockedFields(
      fakeReader([
        {
          versionNumber: 1,
          snapshot: {
            name: "Acme",
            createdAt: "2026-01-01",
            updatedAt: "2026-01-02",
            version: 1,
            searchVector: "acme",
          },
          sourceType: "community",
        },
      ]),
      "utility",
      "u-1"
    );

    expect(locked).toEqual(new Set(["name"]));
  });

  it("returns an empty set when there is no version history", async () => {
    const locked = await getHumanLockedFields(fakeReader([]), "utility", "u-1");

    expect(locked).toEqual(new Set([]));
  });

  it("is not confused by non-human source types like merge", async () => {
    const locked = await getHumanLockedFields(
      fakeReader([
        {
          versionNumber: 1,
          snapshot: { name: "Acme" },
          sourceType: "merge",
        },
      ]),
      "utility",
      "u-1"
    );

    expect(locked).toEqual(new Set([]));
  });
});
