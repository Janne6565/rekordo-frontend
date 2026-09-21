import type { ReleaseDto } from "@/api/generated/rekordoAPI.schemas";
import {
  albumCoverUrl,
  lookupAlbumCovers,
  releaseDisambiguation,
  toRelease,
  toReleases,
} from "@/api/releases";
import type { Album, LocalStore } from "@janne6565/rekordo-shared";
import { rememberArchivedAlbumCovers } from "@janne6565/rekordo-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const albumCovers = vi.hoisted(() => vi.fn());
vi.mock("@/api/generated/metadata/metadata", () => ({ albumCovers }));

const complete: ReleaseDto = {
  id: "musicbrainz:release-1",
  albumId: "musicbrainz:group-1",
  title: "Remain in Light",
  artistName: "Talking Heads",
  year: 1980,
  format: "VINYL",
  label: "Sire",
  catalogNumber: "SRK 6095",
  country: "US",
  barcode: "075992609524",
  coverArtUrl: "https://example.test/front-500",
  coverTheme: { dominantColor: "#010000", accentColor: "#b93326", lightness: 0.001, dark: true },
};

describe("toRelease", () => {
  it("maps a complete payload", () => {
    const release = toRelease(complete, 1000);

    expect(release).toMatchObject({
      id: "musicbrainz:release-1",
      title: "Remain in Light",
      format: "VINYL",
      year: 1980,
      cachedAt: 1000,
      coverTheme: { dominantColor: "#010000", dark: true },
    });
  });

  it("turns absent optional fields into explicit nulls", () => {
    const release = toRelease(
      { id: "musicbrainz:r", albumId: "musicbrainz:g", title: "T", artistName: "A" },
      1000,
    );

    expect(release).toMatchObject({
      year: null,
      label: null,
      catalogNumber: null,
      country: null,
      barcode: null,
      releaseDate: null,
      trackCount: null,
      discCount: null,
      coverArtUrl: null,
      coverTheme: null,
    });
  });

  it.each(["id", "albumId", "title", "artistName"] as const)(
    "rejects a payload missing %s",
    (field) => {
      const broken = { ...complete };
      delete broken[field];

      expect(toRelease(broken, 1000)).toBeNull();
    },
  );

  it("falls back to OTHER for a format it does not know", () => {
    // Rather than crashing on a format the server learned about before this client did.
    const release = toRelease({ ...complete, format: "LASERDISC" as never }, 1000);

    expect(release?.format).toBe("OTHER");
  });

  it("drops a half-populated cover theme rather than rendering a broken one", () => {
    const release = toRelease({ ...complete, coverTheme: { dominantColor: "#fff" } }, 1000);

    expect(release?.coverTheme).toBeNull();
  });
});

describe("toReleases", () => {
  it("keeps the usable rows and drops the rest", () => {
    // One bad row in a search result should not empty the whole list.
    const releases = toReleases([complete, { title: "no ids" }, complete], 1000);

    expect(releases).toHaveLength(2);
  });
});

describe("releaseDisambiguation", () => {
  it("joins what is known and omits what is not", () => {
    const release = toRelease(complete, 0);
    expect(release && releaseDisambiguation(release)).toBe("Sire · SRK 6095 · US");

    const sparse = toRelease({ ...complete, catalogNumber: undefined, country: undefined }, 0);
    expect(sparse && releaseDisambiguation(sparse)).toBe("Sire");
  });
});

describe("lookupAlbumCovers", () => {
  beforeEach(() => {
    albumCovers.mockReset();
  });

  it("keys the answers by the id they were asked for", async () => {
    albumCovers.mockResolvedValue([
      { albumId: "discogs:1", coverArtUrl: "https://covers.example/1.jpg" },
      // An album with nothing behind it still answers, and answers null.
      { albumId: "musicbrainz:2" },
    ]);

    const covers = await lookupAlbumCovers(["discogs:1", "musicbrainz:2"]);

    expect(covers.get("discogs:1")).toBe("https://covers.example/1.jpg");
    expect(covers.get("musicbrainz:2")).toBeNull();
    // Absent rather than null: the caller cannot tell, and does not need to.
    expect(covers.has("local:3")).toBe(false);
  });

  it("asks in pages, because the endpoint takes a hundred at a time", async () => {
    albumCovers.mockResolvedValue([]);
    const ids = Array.from({ length: 150 }, (_, index) => `discogs:${index}`);

    await lookupAlbumCovers(ids);

    expect(albumCovers).toHaveBeenCalledTimes(2);
    expect(albumCovers.mock.calls[0][0].albumId).toHaveLength(100);
    expect(albumCovers.mock.calls[1][0].albumId).toHaveLength(50);
  });

  it("asks nothing when there is nothing to ask about", async () => {
    expect(await lookupAlbumCovers([])).toEqual(new Map());
    expect(albumCovers).not.toHaveBeenCalled();
  });

  /**
   * The bug this closes: an archive exported from staging and imported into prod showed a
   * wishlist of blank silhouettes. The albums are real, prod's release mirror had simply
   * never seen them — and since the covers endpoint calls no catalogue, it never would.
   */
  describe("with an imported archive's covers behind it", () => {
    const ARCHIVED = "https://coverartarchive.org/release-group/a2/front-500";

    /** Only the two methods the cache touches; the rest of the store is not involved. */
    function settingsOnly(): LocalStore {
      const settings = new Map<string, string>();
      return {
        readSetting: async (key: string) => settings.get(key),
        writeSetting: async (key: string, value: string) => void settings.set(key, value),
      } as unknown as LocalStore;
    }

    async function storeHolding(covers: Record<string, string>) {
      const store = settingsOnly();
      await rememberArchivedAlbumCovers(store, covers);
      return store;
    }

    it("fills an album this deployment's mirror cannot resolve", async () => {
      albumCovers.mockResolvedValue([{ albumId: "discogs:2" }]);

      const covers = await lookupAlbumCovers(
        ["discogs:2"],
        await storeHolding({ "discogs:2": ARCHIVED }),
      );

      expect(covers.get("discogs:2")).toBe(ARCHIVED);
    });

    it("leaves a cover this deployment did resolve alone", async () => {
      albumCovers.mockResolvedValue([
        { albumId: "discogs:2", coverArtUrl: "https://covers.example/live.jpg" },
      ]);

      const covers = await lookupAlbumCovers(
        ["discogs:2"],
        await storeHolding({ "discogs:2": ARCHIVED }),
      );

      expect(covers.get("discogs:2")).toBe("https://covers.example/live.jpg");
    });

    it("is inert on a device that has never imported one", async () => {
      albumCovers.mockResolvedValue([{ albumId: "discogs:2" }]);

      const covers = await lookupAlbumCovers(["discogs:2"], settingsOnly());

      expect(covers.get("discogs:2")).toBeNull();
    });
  });
});

/**
 * Asking Apple for the size actually drawn.
 *
 * The whole reason the template is carried at all: one artwork asset serves 8 KB at a
 * phone row's 112px and 45 KB at a detail sheet's 600. Substituting it wrongly does not
 * fail, it silently downloads the wrong size, or renders a URL with braces still in it.
 */
describe("albumCoverUrl", () => {
  const album = (overrides: Partial<Album>): Album => ({
    albumId: "applemusic:1",
    title: "Nevermind",
    artistName: "Nirvana",
    year: 1991,
    primaryType: null,
    coverArtUrl: null,
    coverArtTemplate: null,
    ...overrides,
  });

  const original = globalThis.devicePixelRatio;
  afterEach(() => {
    Object.defineProperty(globalThis, "devicePixelRatio", { value: original, configurable: true });
  });

  function pixelRatio(value: number): void {
    Object.defineProperty(globalThis, "devicePixelRatio", { value, configurable: true });
  }

  it("fills both placeholders with the drawn size", () => {
    pixelRatio(1);
    expect(albumCoverUrl(album({ coverArtTemplate: "https://mz/x/{w}x{h}bb.jpg" }), 112)).toBe(
      "https://mz/x/112x112bb.jpg",
    );
  });

  it("asks for the device's pixels, not the layout's", () => {
    // A 112px row on a 2x screen needs 224 real pixels; asking for 112 renders it soft.
    pixelRatio(2);
    expect(albumCoverUrl(album({ coverArtTemplate: "https://mz/x/{w}x{h}bb.jpg" }), 112)).toBe(
      "https://mz/x/224x224bb.jpg",
    );
  });

  it("falls back to the one fixed image a Discogs answer has", () => {
    pixelRatio(2);
    expect(albumCoverUrl(album({ coverArtUrl: "https://i.discogs.com/cover.jpg" }), 112)).toBe(
      "https://i.discogs.com/cover.jpg",
    );
  });

  it("has nothing to draw when neither is present", () => {
    expect(albumCoverUrl(album({}), 112)).toBeNull();
  });
});
