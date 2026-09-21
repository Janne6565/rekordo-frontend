import "fake-indexeddb/auto";
import { toCsv } from "@/domain/csv";
import { DexieLocalStore } from "@/local/dexieStore";
import { readPhotoBytes } from "@/local/photoBytes";
import type { ClockSource, Release } from "@janne6565/rekordo-shared";
import {
  applyCopyPatch,
  createCopy,
  createManualCopy,
  createPhoto,
  createWishlistItem,
  exportMcArchive,
  hlcInitial,
  hlcTick,
  importMcArchive,
  markUploaded,
  readZip,
  tombstoneCopy,
  tombstonePhoto,
  tombstoneWishlistItem,
} from "@janne6565/rekordo-shared";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";

function clockSource(node = "test-device"): ClockSource {
  let current = hlcInitial(node);
  let wall = 1000;
  return {
    next() {
      wall += 1;
      current = hlcTick(current, wall);
      return current;
    },
  };
}

function release(id: string, overrides: Partial<Release> = {}): Release {
  return {
    id,
    albumId: "group-brew",
    title: "Bitches Brew",
    artistName: "Miles Davis",
    year: 1970,
    format: "VINYL",
    label: "Columbia",
    catalogNumber: "GP 26",
    country: "US",
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

const draft = {
  condition: "VG_PLUS" as const,
  sleeveCondition: "NM" as const,
  catalogArt: "AUTO" as const,
  pricePaidCents: 2800,
  currency: "EUR",
  purchasedOn: "2026-08-14",
  purchasedAt: "Concerto, Amsterdam",
  notes: null,
  rating: 4,
};

/**
 * Exercises the real Dexie store against fake-indexeddb, so the schema, the indexes and
 * the tombstone filtering are covered rather than just the pure helpers around them.
 */
describe("DexieLocalStore", () => {
  let store: DexieLocalStore;
  let clock: ClockSource;

  beforeEach(async () => {
    // fake-indexeddb persists across tests in the same file, so the database has to be
    // dropped explicitly — reassigning globalThis.indexedDB does not isolate Dexie, which
    // has already captured a reference to it.
    await Dexie.delete("music-collector");
    store = new DexieLocalStore();
    clock = clockSource();
    await store.open();
  });

  it("round-trips a copy", async () => {
    const vinyl = release("r-vinyl");
    await store.cacheReleases([vinyl]);
    const copy = createCopy(vinyl, draft, clock, 5000, "copy-1");
    await store.putCopy(copy);

    expect(await store.getCopy("copy-1")).toEqual(copy);
    expect(await store.listCopies()).toHaveLength(1);
  });

  it("hides tombstoned copies from reads but keeps the row", async () => {
    const vinyl = release("r-vinyl");
    await store.cacheReleases([vinyl]);
    await store.putCopy(createCopy(vinyl, draft, clock, 5000, "copy-1"));

    const copy = await store.getCopy("copy-1");
    expect(copy).toBeDefined();
    await store.putCopy(tombstoneCopy(copy as NonNullable<typeof copy>, clock, 9000));

    expect(await store.getCopy("copy-1")).toBeUndefined();
    expect(await store.listCopies()).toHaveLength(0);
    // The tombstone must survive, or the next sync would resurrect the copy.
    expect(await store.stats()).toMatchObject({ copyCount: 0 });
  });

  it("filters by format through the cached release", async () => {
    const vinyl = release("r-vinyl", { format: "VINYL" });
    const cd = release("r-cd", { format: "CD" });
    await store.cacheReleases([vinyl, cd]);
    await store.putCopy(createCopy(vinyl, draft, clock, 1, "c-vinyl"));
    await store.putCopy(createCopy(cd, draft, clock, 2, "c-cd"));

    expect((await store.listCopies({ format: "VINYL" })).map((c) => c.id)).toEqual(["c-vinyl"]);
    expect(await store.listCopies({ format: "ALL" })).toHaveLength(2);
  });

  it("filters a copy by the format it was given, not the one the archive lists", async () => {
    // The tape of a record MusicBrainz only knows as vinyl belongs under Cassette.
    const vinyl = release("r-vinyl", { format: "VINYL" });
    await store.cacheReleases([vinyl]);
    const tape = createCopy(vinyl, draft, clock, 1, "c-tape");
    await store.putCopy(applyCopyPatch(tape, { manualFormat: "CASSETTE" }, clock));
    await store.putCopy(createCopy(vinyl, draft, clock, 2, "c-vinyl"));

    expect((await store.listCopies({ format: "CASSETTE" })).map((c) => c.id)).toEqual(["c-tape"]);
    expect((await store.listCopies({ format: "VINYL" })).map((c) => c.id)).toEqual(["c-vinyl"]);
    expect(await store.stats()).toMatchObject({ byFormat: { CASSETTE: 1, VINYL: 1 } });
  });

  it("searches across title, artist and catalog number", async () => {
    const vinyl = release("r-vinyl");
    await store.cacheReleases([vinyl]);
    await store.putCopy(createCopy(vinyl, draft, clock, 1, "c-1"));

    expect(await store.listCopies({ search: "bitches" })).toHaveLength(1);
    expect(await store.listCopies({ search: "miles" })).toHaveLength(1);
    expect(await store.listCopies({ search: "GP 26" })).toHaveLength(1);
    expect(await store.listCopies({ search: "coltrane" })).toHaveLength(0);
  });

  it("finds the other copies of the same album across formats", async () => {
    // This is what the detail screen's "other copies of this release" reads.
    const vinyl = release("r-vinyl", { format: "VINYL" });
    const cd = release("r-cd", { format: "CD" });
    const unrelated = release("r-other", { albumId: "group-light", format: "CASSETTE" });
    await store.cacheReleases([vinyl, cd, unrelated]);
    await store.putCopy(createCopy(vinyl, draft, clock, 1, "c-vinyl"));
    await store.putCopy(createCopy(cd, draft, clock, 2, "c-cd"));
    await store.putCopy(createCopy(unrelated, draft, clock, 3, "c-other"));

    const siblings = await store.listCopiesInReleaseGroup("group-brew");

    expect(siblings.map((c) => c.id).sort()).toEqual(["c-cd", "c-vinyl"]);
  });

  describe("a copy nobody has a record of", () => {
    const tape = {
      manualTitle: "Untitled live tape",
      manualArtist: "Sun Ra Arkestra",
      manualYear: 1978,
      manualLabel: "Saturn",
      manualCatalogNumber: "ES 9956",
      manualFormat: "CASSETTE" as const,
    };

    it("resolves its release from itself, with nothing in the mirror", async () => {
      // The mirror is deliberately empty: a device that pulled this copy from the server
      // has no cache row for it and must still be able to draw it.
      await store.putCopy(createManualCopy(tape, draft, clock, 1, "c-tape"));

      expect(await store.getRelease("local:c-tape")).toMatchObject({
        title: "Untitled live tape",
        artistName: "Sun Ra Arkestra",
        format: "CASSETTE",
      });
    });

    it("stands on the shelf beside catalogued copies, and filters with them", async () => {
      const vinyl = release("r-vinyl", { format: "VINYL" });
      await store.cacheReleases([vinyl]);
      await store.putCopy(createCopy(vinyl, draft, clock, 1, "c-vinyl"));
      await store.putCopy(createManualCopy(tape, draft, clock, 2, "c-tape"));

      expect(await store.listCopies()).toHaveLength(2);
      expect((await store.listCopies({ format: "CASSETTE" })).map((c) => c.id)).toEqual(["c-tape"]);
      expect((await store.listCopies({ search: "sun ra" })).map((c) => c.id)).toEqual(["c-tape"]);
      expect(await store.stats()).toMatchObject({
        copyCount: 2,
        releaseGroupCount: 2,
      });
    });

    it("follows a corrected title rather than a row written at creation", async () => {
      const copy = createManualCopy(tape, draft, clock, 1, "c-tape");
      await store.putCopy(applyCopyPatch(copy, { manualTitle: "Live at the Bandbox" }, clock));

      expect(await store.getRelease("local:c-tape")).toMatchObject({
        title: "Live at the Bandbox",
      });
    });
  });

  it("counts copies and albums separately in stats", async () => {
    const vinyl = release("r-vinyl", { format: "VINYL" });
    const cd = release("r-cd", { format: "CD" });
    await store.cacheReleases([vinyl, cd]);
    await store.putCopy(createCopy(vinyl, draft, clock, 1, "c-vinyl"));
    await store.putCopy(createCopy(cd, draft, clock, 2, "c-cd"));

    expect(await store.stats()).toMatchObject({
      copyCount: 2,
      releaseGroupCount: 1,
      totalSpentCents: 5600,
      averageSpentCents: 2800,
    });
  });

  it("keeps the device id stable across reopens", async () => {
    // The device id is the tie-breaker in every field-level merge; a new one on each
    // start would make conflict resolution non-deterministic.
    const first = await store.deviceId();

    const reopened = new DexieLocalStore();
    await reopened.open();

    expect(await reopened.deviceId()).toBe(first);
  });

  it("persists the clock so stamps never go backwards after a restart", async () => {
    await store.writeClock("000000000001000:0005:test-device");

    const reopened = new DexieLocalStore();
    await reopened.open();

    expect(await reopened.readClock()).toBe("000000000001000:0005:test-device");
  });
});

describe("wishlist", () => {
  let store: DexieLocalStore;
  let clock: ClockSource;

  beforeEach(async () => {
    await Dexie.delete("music-collector");
    store = new DexieLocalStore();
    clock = clockSource();
    await store.open();
  });

  function wish(id: string, group = "group-brew") {
    return createWishlistItem(
      {
        albumId: group,
        releaseId: null,
        title: "Ege Bamyasi",
        artistName: "Can",
        year: 1972,
        desiredFormat: "VINYL",
        note: "Want an original Spoon press",
      },
      clock,
      1000,
      id,
    );
  }

  it("round-trips a wish and marks it pending", async () => {
    await store.putWishlistItem(wish("w-1"));

    expect(await store.listWishlist()).toHaveLength(1);
    // Wishes and copies share one pending set, so they push in a single request.
    expect(await store.readPendingIds()).toEqual(["w-1"]);
  });

  it("hides a tombstoned wish but keeps the row for sync", async () => {
    await store.putWishlistItem(wish("w-1"));
    const stored = await store.getWishlistItemIncludingDeleted("w-1");
    await store.putWishlistItem(
      tombstoneWishlistItem(stored as NonNullable<typeof stored>, clock, 9000),
    );

    expect(await store.listWishlist()).toHaveLength(0);
    expect((await store.getWishlistItemIncludingDeleted("w-1"))?.deletedAt).toBe(9000);
  });

  it("knows whether an album is already wished for", async () => {
    await store.putWishlistItem(wish("w-1", "group-brew"));

    expect(await store.wishlistHas("group-brew")).toBe(true);
    expect(await store.wishlistHas("group-light")).toBe(false);
  });

  it("stops counting an album as wished for once the wish is deleted", async () => {
    await store.putWishlistItem(wish("w-1", "group-brew"));
    const stored = await store.getWishlistItemIncludingDeleted("w-1");
    await store.putWishlistItem(
      tombstoneWishlistItem(stored as NonNullable<typeof stored>, clock, 9000),
    );

    expect(await store.wishlistHas("group-brew")).toBe(false);
  });

  it("adopting a wish does not mark it pending", async () => {
    // Otherwise the client pushes straight back what it just pulled, forever.
    await store.adoptWishlistItem(wish("w-1"));

    expect(await store.readPendingIds()).toEqual([]);
  });
});

describe("photos", () => {
  let store: DexieLocalStore;
  let clock: ClockSource;

  beforeEach(async () => {
    await Dexie.delete("music-collector");
    store = new DexieLocalStore();
    clock = clockSource();
    await store.open();
  });

  function photo(id: string, copyId = "copy-1", sortIndex = 0) {
    return createPhoto(
      { copyId, contentType: "image/jpeg", byteSize: 1024, sortIndex },
      clock,
      1000,
      id,
    );
  }

  const bytes = () => new Uint8Array([1, 2, 3]).buffer;

  it("round-trips a photo and its bytes", async () => {
    await store.putPhoto(photo("p-1"));
    await store.putPhotoBytes("p-1", bytes(), "image/jpeg");

    expect(await store.listPhotos("copy-1")).toHaveLength(1);
    expect((await store.getPhotoBytes("p-1"))?.size).toBe(3);
  });

  it("returns the strip in sort order", async () => {
    await store.putPhoto(photo("p-c", "copy-1", 2));
    await store.putPhoto(photo("p-a", "copy-1", 0));
    await store.putPhoto(photo("p-b", "copy-1", 1));

    expect((await store.listPhotos("copy-1")).map((p) => p.id)).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("only lists photos for the copy asked about", async () => {
    await store.putPhoto(photo("p-1", "copy-1"));
    await store.putPhoto(photo("p-2", "copy-2"));

    expect((await store.listPhotos("copy-1")).map((p) => p.id)).toEqual(["p-1"]);
  });

  it("hides a tombstoned photo but keeps the row for sync", async () => {
    await store.putPhoto(photo("p-1"));
    const stored = await store.getPhotoIncludingDeleted("p-1");
    await store.putPhoto(tombstonePhoto(stored as NonNullable<typeof stored>, clock, 9000));

    expect(await store.listPhotos("copy-1")).toHaveLength(0);
    expect((await store.getPhotoIncludingDeleted("p-1"))?.deletedAt).toBe(9000);
  });

  it("picks one cover photo per copy in a single lookup", async () => {
    // What the library grid stands in with, so it has to be the same picture the detail
    // strip shows first — the lowest sort index, not whichever row comes back first.
    await store.putPhoto(photo("p-second", "copy-1", 1));
    await store.putPhoto(photo("p-first", "copy-1", 0));
    await store.putPhoto(photo("p-other", "copy-2", 0));

    const covers = await store.listCoverPhotos(["copy-1", "copy-2", "copy-3"]);

    expect(covers.get("copy-1")?.id).toBe("p-first");
    expect(covers.get("copy-2")?.id).toBe("p-other");
    expect(covers.has("copy-3")).toBe(false);
  });

  it("leaves a copy out of the cover lookup once its only photo is deleted", async () => {
    await store.putPhoto(photo("p-1"));
    const stored = await store.getPhotoIncludingDeleted("p-1");
    await store.putPhoto(tombstonePhoto(stored as NonNullable<typeof stored>, clock, 9000));

    expect((await store.listCoverPhotos(["copy-1"])).has("copy-1")).toBe(false);
  });

  it("offers for upload only photos whose bytes are actually here", async () => {
    // A photo pulled from another device has metadata but no local bytes; uploading it
    // would be impossible and retrying forever would be pointless.
    await store.putPhoto(photo("p-local"));
    await store.putPhotoBytes("p-local", bytes(), "image/jpeg");
    await store.putPhoto(photo("p-elsewhere"));

    expect((await store.listPhotosAwaitingUpload()).map((p) => p.id)).toEqual(["p-local"]);
  });

  it("stops offering a photo for upload once it has a storage key", async () => {
    await store.putPhoto(photo("p-1"));
    await store.putPhotoBytes("p-1", bytes(), "image/jpeg");
    const stored = await store.getPhotoIncludingDeleted("p-1");
    await store.putPhoto(markUploaded(stored as NonNullable<typeof stored>, "user/p-1", clock));

    expect(await store.listPhotosAwaitingUpload()).toHaveLength(0);
  });

  it("adopting a photo does not mark it pending", async () => {
    await store.adoptPhoto(photo("p-1"));

    expect(await store.readPendingIds()).toEqual([]);
  });
});

/**
 * The archive over the real store.
 *
 * The pure round-trip is covered in the shared package against an in-memory store; what
 * this adds is the browser's own two halves — Dexie's whole-shelf photo query, and reading
 * a `Blob` back out of IndexedDB — which is exactly where the export can lose a picture
 * without any of the shared tests noticing.
 */
describe("the .mc archive over Dexie", () => {
  let store: DexieLocalStore;
  let clock: ClockSource;

  beforeEach(async () => {
    await Dexie.delete("music-collector");
    store = new DexieLocalStore();
    await store.open();
    clock = clockSource();
  });

  async function seed() {
    await store.cacheReleases([release("brew-1")]);
    const copy = createCopy(release("brew-1"), draft, clock, 1700, "copy-1");
    await store.putCopy(copy);
    const photo = createPhoto(
      { copyId: copy.id, contentType: "image/jpeg", byteSize: 4, sortIndex: 0 },
      clock,
      1701,
      "photo-1",
    );
    await store.putPhoto(photo);
    await store.putPhotoBytes(
      photo.id,
      new Uint8Array([0xff, 0xd8, 0x11, 0x22]).buffer,
      photo.contentType,
    );
    await store.putWishlistItem(
      createWishlistItem(
        {
          albumId: "group-kind",
          releaseId: "musicbrainz:r-kind",
          title: "Kind of Blue",
          artistName: "Miles Davis",
          year: 1959,
          desiredFormat: "VINYL",
          note: null,
        },
        clock,
        1702,
        "wish-1",
      ),
    );
    return copy;
  }

  async function archive() {
    return await exportMcArchive(
      store,
      { collection: toCsv(await store.listCopies(), new Map()), wishlist: "albumId\r\n" },
      (photoId) => readPhotoBytes(store, photoId),
      new Date("2026-08-26T10:30:00Z"),
    );
  }

  it("finds every live photo, and no tombstoned one", async () => {
    await seed();
    const gone = createPhoto(
      { copyId: "copy-1", contentType: "image/png", byteSize: 1, sortIndex: 1 },
      clock,
      1800,
      "photo-gone",
    );
    await store.putPhoto(tombstonePhoto(gone, clock, 1801));

    expect((await store.listAllPhotos()).map((photo) => photo.id)).toEqual(["photo-1"]);
  });

  it("reads the bytes back out of IndexedDB and into the archive", async () => {
    await seed();

    const built = await archive();

    expect(built).toMatchObject({ copies: 1, wishes: 1, photos: 1, photosWithoutBytes: 0 });
    const entry = readZip(built.bytes).find((file) => file.path === "photos/photo-1.jpg");
    expect([...(entry?.bytes ?? [])]).toEqual([0xff, 0xd8, 0x11, 0x22]);
  });

  it("round-trips into an empty database with the copy still itself", async () => {
    const copy = await seed();
    const built = await archive();
    await Dexie.delete("music-collector");
    const restored = new DexieLocalStore();
    await restored.open();

    const result = await importMcArchive(restored, built.bytes, clockSource("other-device"));

    expect(result).toMatchObject({ copies: 1, wishes: 1, photos: 1 });
    expect(await restored.listCopies()).toEqual([copy]);
    expect((await restored.listPhotos("copy-1"))[0].id).toBe("photo-1");
    // Read as a buffer rather than through getPhotoBytes: jsdom's Blob has no
    // arrayBuffer, which is one of the reasons the export takes this route in the browser.
    expect([...((await readPhotoBytes(restored, "photo-1")) ?? [])]).toEqual([
      0xff, 0xd8, 0x11, 0x22,
    ]);
    // The picture has to go up under this account, whoever uploaded it before.
    expect(await restored.listPhotosAwaitingUpload()).toHaveLength(1);
  });
});

/** A copy row as version 8 wrote it: no albumId anywhere on it. */
const baseCopyRow = {
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
  createdAt: 1000,
  deletedAt: null,
  fieldClocks: {},
};

/**
 * The upgrade that gave a copy its own album.
 *
 * Worth its own file because it is the only code here that runs against data already
 * sitting in somebody's browser, and it runs exactly once. A copy that comes out of it
 * with no album belongs to nothing: it drops out of its own shelf grouping, and there is
 * no second chance to notice, because version 9 will never run on that database again.
 */
describe("the version 9 upgrade", () => {
  beforeEach(async () => {
    await Dexie.delete("music-collector");
  });

  /** A database as version 8 left it: copies with a pressing and no album at all. */
  async function seedVersion8(
    copies: readonly Record<string, unknown>[],
    releases: readonly Record<string, unknown>[],
  ): Promise<void> {
    const old = new Dexie("music-collector");
    old.version(8).stores({
      copies: "id, releaseId, createdAt, deletedAt",
      releaseCache: "id, albumId",
      wishlist: "id, albumId, deletedAt",
      photos: "id, copyId, wishId, storageKey, deletedAt",
      photoBytes: "id",
      meta: "key",
      copyOrigins: "id",
    });
    await old.open();
    await old.table("releaseCache").bulkAdd(releases as never[]);
    await old.table("copies").bulkAdd(copies as never[]);
    old.close();
  }

  async function albumIdsAfterUpgrade(): Promise<Map<string, unknown>> {
    const store = new DexieLocalStore();
    await store.open();
    const copies = await store.listCopies();
    return new Map(copies.map((copy) => [copy.id, copy.albumId]));
  }

  it("takes the album from the cached pressing", async () => {
    await seedVersion8(
      [{ ...baseCopyRow, id: "c-1", releaseId: "discogs:1" }],
      [{ id: "discogs:1", albumId: "discogs:900" }],
    );

    expect((await albumIdsAfterUpgrade()).get("c-1")).toBe("discogs:900");
  });

  it("makes a hand-entered copy its own album", async () => {
    // A `local:` pressing is in no catalogue, so nothing will ever resolve it for us; the
    // copy is both the pressing and the record, exactly as it is on the phone.
    await seedVersion8([{ ...baseCopyRow, id: "c-2", releaseId: "local:c-2" }], []);

    expect((await albumIdsAfterUpgrade()).get("c-2")).toBe("local:c-2");
  });

  it("leaves an uncached pressing to the next sync rather than guessing", async () => {
    // Null here means "not known yet", which resolves. A wrong album would not.
    await seedVersion8([{ ...baseCopyRow, id: "c-3", releaseId: "discogs:404" }], []);

    expect((await albumIdsAfterUpgrade()).get("c-3")).toBeNull();
  });

  it("does not disturb a copy that already carries an album", async () => {
    await seedVersion8(
      [{ ...baseCopyRow, id: "c-4", releaseId: "discogs:1", albumId: "discogs:already" }],
      [{ id: "discogs:1", albumId: "discogs:900" }],
    );

    expect((await albumIdsAfterUpgrade()).get("c-4")).toBe("discogs:already");
  });
});
