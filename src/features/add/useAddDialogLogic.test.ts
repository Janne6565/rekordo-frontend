import { lookupByBarcode, searchAlbums } from "@/api/releases";
import type { LocalStore, Release } from "@janne6565/rekordo-shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/releases", async (original) => ({
  ...(await original<typeof import("@/api/releases")>()),
  searchAlbums: vi.fn(async () => []),
  lookupByBarcode: vi.fn(async () => []),
}));

const settings = new Map<string, string>();

const copies: unknown[] = [];
/** Adding a copy consults the wishlist now (screen 16e), so the fake has to hold one. */
let wishes: unknown[] = [];

const store = {
  listCopies: async () => [],
  cacheReleases: async () => {},
  putCopy: async (copy: unknown) => {
    copies.push(copy);
  },
  listWishlist: async () => wishes,
  // An upsert, like the real store: the heart pill writes a new entry, and the wishlist
  // tombstone rewrites an existing one.
  putWishlistItem: async (item: { id: string }) => {
    const at = wishes.findIndex((wish) => (wish as { id: string }).id === item.id);
    if (at === -1) wishes.push(item);
    else wishes[at] = item;
  },
  readSetting: async (key: string) => settings.get(key),
  writeSetting: async (key: string, value: string) => {
    settings.set(key, value);
  },
} as unknown as LocalStore;

vi.mock("@/local/StoreProvider", () => ({
  useStore: () => ({ store, clock: { next: () => ({ wall: 1, counter: 0, node: "test" }) } }),
}));

// Imported after the mocks above are registered, so the hook picks them up.
const { useAddDialogLogic } = await import("@/features/add/useAddDialogLogic");

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useAddDialogLogic(vi.fn()), {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  });
}

const RELEASE: Release = {
  id: "musicbrainz:1",
  albumId: "musicbrainz:a1",
  title: "Bitches Brew",
  artistName: "Miles Davis",
  year: 1970,
  format: "VINYL",
  label: "Columbia",
  catalogNumber: "GP 26",
  country: "US",
  barcode: null,
  releaseDate: "1970-03-30",
  trackCount: 6,
  discCount: 2,
  coverArtUrl: null,
  coverTheme: null,
  cachedAt: 0,
};

/**
 * Lets the debounce fire and the query that follows it settle.
 *
 * Twice: the first pass fires the timer, and the request it schedules only goes out on
 * the re-render that `act` flushes on its way out.
 */
async function settle() {
  for (let pass = 0; pass < 2; pass += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
  }
}

/** Types a term the way a person does, one keystroke at a time. */
async function type(result: { current: ReturnType<typeof useAddDialogLogic> }, term: string) {
  for (let index = 1; index <= term.length; index += 1) {
    const soFar = term.slice(0, index);
    await act(async () => {
      result.current.setTerm(soFar);
      await vi.advanceTimersByTimeAsync(40);
    });
  }
}

describe("useAddDialogLogic", () => {
  beforeEach(() => {
    settings.clear();
    copies.length = 0;
    wishes = [];
    vi.mocked(searchAlbums).mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("searches without being asked, once the field stands still", async () => {
    const { result } = harness();

    await type(result, "brian eno");
    expect(searchAlbums).not.toHaveBeenCalled();

    await settle();

    // Nine keystrokes, one request — the whole point of the debounce.
    expect(searchAlbums).toHaveBeenCalledTimes(1);
    expect(searchAlbums).toHaveBeenCalledWith("brian eno");
  });

  it("shows the wait from the keystroke, not from the request", async () => {
    // The skeletons stand in for the whole wait. If `searching` only turned on when the
    // request went out, the debounce would read as a list that had stopped responding.
    const { result } = harness();

    await type(result, "eno");

    expect(result.current.searching).toBe(true);
    expect(result.current.hasSearched).toBe(true);
  });

  it("does not send a term too short to mean anything", async () => {
    const { result } = harness();

    await type(result, "e");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(searchAlbums).not.toHaveBeenCalled();
    expect(result.current.searching).toBe(false);
  });

  it("only sends a barcode once it is complete", async () => {
    const { result } = harness();
    await act(async () => result.current.setTab("BARCODE"));

    await type(result, "5099");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(searchAlbums).not.toHaveBeenCalled();
  });

  it("sends a complete barcode to the barcode lookup, not the record search", async () => {
    // The two are different questions. A barcode is printed on an object, so the scan has
    // already picked the pressing out; answering it with records would throw that away.
    const { result } = harness();
    await act(async () => result.current.setTab("BARCODE"));

    await type(result, "5099969476013");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(searchAlbums).not.toHaveBeenCalled();
    expect(lookupByBarcode).toHaveBeenCalledWith("5099969476013");
    expect(result.current.scanned).toBe(true);
  });

  it("runs straight away on Enter", async () => {
    const { result } = harness();

    await act(async () => result.current.setTerm("brian eno"));
    await act(async () => result.current.submit());

    expect(searchAlbums).toHaveBeenCalledTimes(1);
  });

  it("drops the results when the field is emptied", async () => {
    const { result } = harness();

    await type(result, "brian eno");
    await settle();
    expect(result.current.searching).toBe(false);

    await act(async () => result.current.setTerm(""));

    // Back to the recent searches, rather than the last results left stranded under a box
    // that no longer says what produced them.
    expect(result.current.hasSearched).toBe(false);
  });

  it("writes the copy on the click and asks for nothing else", async () => {
    // The details step used to sit between the click and the copy, which made adding four
    // pressings in one sitting four dismissals long. Condition and price are now added
    // from the copy itself, whenever there is a reason to.
    const { result } = harness();

    await act(async () => result.current.addRelease(RELEASE));
    await settle();

    expect(copies).toHaveLength(1);
    expect(result.current.added).toEqual({ shelf: 1, wishlist: 0 });
  });

  it("writes a wishlist entry on the click, with the format of the row", async () => {
    // The pill used to open a sheet asking for the format and a note. The row already
    // named the format, and a note is something people write on the wishlist itself.
    const { result } = harness();

    await act(async () => result.current.addWish(RELEASE));
    await settle();

    expect(wishes).toHaveLength(1);
    expect(wishes[0]).toMatchObject({
      albumId: RELEASE.albumId,
      releaseId: RELEASE.id,
      title: RELEASE.title,
      desiredFormat: RELEASE.format,
    });
    expect(result.current.added).toEqual({ shelf: 0, wishlist: 1 });
  });

  it("takes the record off the wishlist when the copy that satisfies it is filed", async () => {
    // Screen 16e — the wishlist's quietest exit. Wired here rather than on the wishlist
    // page because the add is where it happens, whichever way in was used.
    wishes = [
      {
        id: "w1",
        albumId: RELEASE.albumId,
        title: RELEASE.title,
        artistName: RELEASE.artistName,
        year: RELEASE.year,
        desiredFormat: "VINYL",
        note: null,
        sortIndex: null,
        createdAt: 1,
        deletedAt: null,
        fieldClocks: {},
      },
    ];
    const { result } = harness();

    await act(async () => result.current.addRelease(RELEASE));
    await settle();

    expect((wishes[0] as { deletedAt: number | null }).deletedAt).not.toBeNull();
  });

  it("leaves an entry standing when the copy is not the format it asked for", async () => {
    wishes = [
      {
        id: "w1",
        albumId: RELEASE.albumId,
        title: RELEASE.title,
        artistName: RELEASE.artistName,
        year: RELEASE.year,
        // The release is vinyl; wanting the tape is not satisfied by buying the record.
        desiredFormat: "CASSETTE",
        note: null,
        sortIndex: null,
        createdAt: 1,
        deletedAt: null,
        fieldClocks: {},
      },
    ];
    const { result } = harness();

    await act(async () => result.current.addRelease(RELEASE));
    await settle();

    expect((wishes[0] as { deletedAt: number | null }).deletedAt).toBeNull();
  });

  it("drops the picked row once it has been added", async () => {
    // Otherwise the footer stays armed on a release that is already in the library, and
    // the next press meant for the sheet files a second copy of it.
    const { result } = harness();

    await act(async () => result.current.select(RELEASE));
    expect(result.current.selected).not.toBeNull();

    await act(async () => result.current.addRelease(RELEASE));
    await settle();

    expect(result.current.selected).toBeNull();
  });

  it("remembers a search somebody pressed for, not every prefix on the way", async () => {
    const { result } = harness();

    await type(result, "brian eno");
    await settle();

    expect(settings.get("recentSearches")).toBeUndefined();

    await act(async () => result.current.submit());
    await settle();
    expect(settings.get("recentSearches")).toBe('["brian eno"]');
  });
});
