import { computeStats, sortCopies } from "@/local/dexieStore";
import type { Copy, Release } from "@janne6565/rekordo-shared";
import { describe, expect, it } from "vitest";

function release(id: string, overrides: Partial<Release> = {}): Release {
  return {
    id,
    albumId: `group-${id}`,
    title: `Title ${id}`,
    artistName: `Artist ${id}`,
    year: 1980,
    format: "VINYL",
    label: null,
    catalogNumber: null,
    country: null,
    barcode: null,
    releaseDate: null,
    trackCount: null,
    discCount: null,
    coverArtUrl: null,
    coverTheme: null,
    cachedAt: 0,
    ...overrides,
  };
}

function copy(id: string, releaseId: string | null, overrides: Partial<Copy> = {}): Copy {
  return {
    id,
    releaseId,
    albumId: null,
    pendingBarcode: null,
    manualTitle: null,
    manualArtist: null,
    manualYear: null,
    manualLabel: null,
    manualCatalogNumber: null,
    manualFormat: null,
    condition: null,
    sleeveCondition: null,
    catalogArt: "AUTO",
    pricePaidCents: null,
    currency: "EUR",
    purchasedOn: null,
    purchasedAt: null,
    notes: null,
    notesConflict: null,
    rating: null,
    hidden: false,
    sortIndex: null,
    createdAt: 0,
    deletedAt: null,
    fieldClocks: {} as Copy["fieldClocks"],
    ...overrides,
  };
}

describe("computeStats", () => {
  it("counts copies and distinct albums separately", () => {
    // Owning the same album on vinyl and CD is two copies but one release group —
    // which is exactly what "240 copies · 197 releases" on screen 1f means.
    const releases = new Map([
      ["v", release("v", { albumId: "brew", format: "VINYL" })],
      ["c", release("c", { albumId: "brew", format: "CD" })],
      ["k", release("k", { albumId: "light", format: "CASSETTE" })],
    ]);

    const stats = computeStats([copy("1", "v"), copy("2", "c"), copy("3", "k")], releases);

    expect(stats.copyCount).toBe(3);
    expect(stats.releaseGroupCount).toBe(2);
    expect(stats.byFormat).toMatchObject({ VINYL: 1, CD: 1, CASSETTE: 1, DIGITAL: 0 });
  });

  it("counts a copy under the format it was given rather than the catalogue's", () => {
    const releases = new Map([["v", release("v", { format: "VINYL" })]]);

    const stats = computeStats([copy("1", "v", { manualFormat: "CASSETTE" })], releases);

    expect(stats.byFormat).toMatchObject({ CASSETTE: 1, VINYL: 0 });
  });

  it("totals and averages what was actually paid", () => {
    const releases = new Map([["v", release("v")]]);

    const stats = computeStats(
      [copy("1", "v", { pricePaidCents: 2800 }), copy("2", "v", { pricePaidCents: 400 })],
      releases,
    );

    expect(stats.totalSpentCents).toBe(3200);
    expect(stats.averageSpentCents).toBe(1600);
  });

  it("treats an unpriced copy as zero rather than dropping it from the average", () => {
    const releases = new Map([["v", release("v")]]);

    const stats = computeStats(
      [copy("1", "v", { pricePaidCents: 1000 }), copy("2", "v")],
      releases,
    );

    expect(stats.totalSpentCents).toBe(1000);
    expect(stats.averageSpentCents).toBe(500);
  });

  it("does not divide by zero on an empty collection", () => {
    const stats = computeStats([], new Map());

    expect(stats.averageSpentCents).toBe(0);
    expect(stats.copyCount).toBe(0);
  });

  it("still counts a copy whose release is not cached yet", () => {
    // The copy exists; we just cannot attribute it to a format.
    const stats = computeStats([copy("1", "unknown", { pricePaidCents: 500 })], new Map());

    expect(stats.copyCount).toBe(1);
    expect(stats.totalSpentCents).toBe(500);
    expect(stats.releaseGroupCount).toBe(0);
  });
});

describe("sortCopies", () => {
  const releases = new Map([
    ["a", release("a", { artistName: "Talking Heads", year: 1980 })],
    ["b", release("b", { artistName: "Can", year: 1972 })],
    ["c", release("c", { artistName: "Miles Davis", year: 2001 })],
  ]);
  const copies = [
    copy("1", "a", { createdAt: 10 }),
    copy("2", "b", { createdAt: 30 }),
    copy("3", "c", { createdAt: 20 }),
  ];

  it("puts the most recently added first by default", () => {
    expect(sortCopies(copies, releases, "ADDED_DESC").map((c) => c.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by artist name", () => {
    expect(sortCopies(copies, releases, "ARTIST_ASC").map((c) => c.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by year, newest first", () => {
    expect(sortCopies(copies, releases, "YEAR_DESC").map((c) => c.id)).toEqual(["3", "1", "2"]);
  });

  it("does not mutate the input", () => {
    const original = [...copies];
    sortCopies(copies, releases, "ARTIST_ASC");
    expect(copies).toEqual(original);
  });
});
