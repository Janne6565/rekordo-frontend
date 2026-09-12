import type {
  CollectionStats,
  Copy,
  Format,
  LibraryFilter,
  LocalStore,
  Photo,
  Release,
  WishlistItem,
} from "@janne6565/rekordo-shared";
import {
  FORMATS,
  compareManualOrder,
  copyFormat,
  isManualReleaseId,
  manualRelease,
  manualReleaseCopyId,
  manualReleaseId,
} from "@janne6565/rekordo-shared";
import Dexie, { type EntityTable } from "dexie";

const DEVICE_ID_KEY = "deviceId";
const CLOCK_KEY = "clock";
const CURSOR_KEY = "syncCursor";
const PENDING_KEY = "pendingIds";
/** Namespaced, so a preference can never collide with the sync bookkeeping above. */
const SETTING_PREFIX = "setting:";

interface MetaRow {
  key: string;
  value: string;
}

/**
 * Image bytes, in their own table so a library read never drags them along.
 *
 * Stored as an ArrayBuffer rather than a Blob: Blob support in IndexedDB is uneven across
 * engines, and a buffer plus its content type reconstructs the Blob exactly.
 */
interface PhotoBytesRow {
  id: string;
  buffer: ArrayBuffer;
  contentType: string;
}

/**
 * Every id written before the app read two catalogues came from MusicBrainz, so prefixing
 * is exactly right. Guarded against running twice, which an interrupted upgrade can do.
 */
function qualify(id: string | undefined): string {
  if (id === undefined || id === null) return id as unknown as string;
  return id.includes(":") ? id : `musicbrainz:${id}`;
}

function renameClock(row: Record<string, unknown>, from: string, to: string): void {
  const clocks = row.fieldClocks as Record<string, string> | undefined;
  if (clocks === undefined || clocks[from] === undefined) return;
  clocks[to] = clocks[from];
  delete clocks[from];
}

class MusicCollectorDb extends Dexie {
  copies!: EntityTable<Copy, "id">;
  releaseCache!: EntityTable<Release, "id">;
  wishlist!: EntityTable<WishlistItem, "id">;
  photos!: EntityTable<Photo, "id">;
  photoBytes!: EntityTable<PhotoBytesRow, "id">;
  meta!: EntityTable<MetaRow, "key">;
  copyOrigins!: EntityTable<CopyOriginRow, "id">;

  constructor() {
    // The IndexedDB database name, deliberately still the pre-Rekordo one. It is the
    // handle to the collection already sitting in people's browsers, and this app is
    // local-first: a visitor with no account has nothing anywhere else. Renaming it
    // would not migrate that data, it would hide it behind a name nothing reads, and
    // the app would open on an empty library. Same reasoning as the versions below.
    super("music-collector");
    // Only fields that are queried or sorted need indexing; the rest ride along in the row.
    // Versions 1 and 2 are history: they describe databases that exist on people's
    // machines, and editing them would make Dexie disagree with what is actually on disk.
    this.version(1).stores({
      copies: "id, releaseMbid, createdAt, deletedAt",
      releases: "mbid, releaseGroupMbid",
      wishlist: "id, releaseGroupMbid, deletedAt",
      meta: "key",
    });
    this.version(2).stores({
      copies: "id, releaseMbid, createdAt, deletedAt",
      releases: "mbid, releaseGroupMbid",
      wishlist: "id, releaseGroupMbid, deletedAt",
      photos: "id, copyId, storageKey, deletedAt",
      photoBytes: "id",
      meta: "key",
    });

    /**
     * Ids become source-qualified, because the app now reads two catalogues.
     *
     * The cached releases move to a new table rather than being altered in place: their
     * primary key was `mbid` and is now `id`, and IndexedDB cannot change a key path on an
     * existing store. `releaseCache` is also the more honest name — these rows are a copy
     * of what upstream said, discardable in a way that copies and wishes are not.
     *
     * The rows are carried across rather than dropped. Without them a library that is
     * offline would show a grid of dashes: nothing re-fetches release metadata on its own.
     */
    this.version(3)
      .stores({
        copies: "id, releaseId, createdAt, deletedAt",
        releaseCache: "id, albumId",
        wishlist: "id, albumId, deletedAt",
        photos: "id, copyId, storageKey, deletedAt",
        photoBytes: "id",
        meta: "key",
      })
      .upgrade(async (tx) => {
        const cached = await tx.table("releases").toArray();
        await tx.table("releaseCache").bulkAdd(
          cached.map(({ mbid, releaseGroupMbid, ...rest }) => ({
            ...rest,
            id: qualify(mbid),
            albumId: qualify(releaseGroupMbid),
          })),
        );

        // The field clocks are keyed by field name, so a clock left under the old key
        // reads as never-set — losing every edit that field has ever won in a merge.
        await tx
          .table("copies")
          .toCollection()
          .modify((copy: Record<string, unknown>) => {
            copy.releaseId = qualify(copy.releaseMbid as string);
            copy.releaseMbid = undefined;
            renameClock(copy, "releaseMbid", "releaseId");
          });

        await tx
          .table("wishlist")
          .toCollection()
          .modify((wish: Record<string, unknown>) => {
            wish.albumId = qualify(wish.releaseGroupMbid as string);
            wish.releaseGroupMbid = undefined;
            renameClock(wish, "releaseGroupMbid", "albumId");
          });
      });

    // Dropped in its own version: a store cannot be read in the upgrade that deletes it.
    this.version(4).stores({ releases: null });

    /**
     * Why each not-yet-pushed copy exists.
     *
     * Local-only and deliberately outside the Copy itself: it is the reason for one push,
     * not a fact about the record, and it stops mattering the moment the server has seen
     * the row. Keeping it here rather than on the copy also means it never has to merge —
     * two devices can never disagree about a question only one of them was asked.
     */
    this.version(5).stores({ copyOrigins: "id" });

    /**
     * A photo can now picture a wishlist entry as well as a copy, so `wishId` is indexed
     * the way `copyId` always was.
     *
     * The rows already here need no rewriting: an existing photo has no `wishId` at all,
     * and Dexie leaves a record out of an index whose key path it lacks — which is
     * exactly right, since a copy's photo must never be found by a wish lookup.
     */
    this.version(6).stores({
      photos: "id, copyId, wishId, storageKey, deletedAt",
    });

    /**
     * A wish now remembers the pressing it was made from.
     *
     * No index — nothing looks an entry up by it; it is read off the row that is already
     * in hand. The existing rows are written rather than left alone, because `undefined`
     * and `null` are the same thing to IndexedDB but not to the merge: a field that is
     * absent from a pushed record reads as one nobody has ever set, which is exactly what
     * an entry made before this existed should say.
     */
    this.version(7).upgrade(async (tx) => {
      await tx
        .table("wishlist")
        .toCollection()
        .modify((wish: Record<string, unknown>) => {
          wish.releaseId = null;
        });
    });
  }
}

/**
 * IndexedDB-backed store for the web app.
 *
 * localStorage is not an option here: it caps out around 5 MB, it is synchronous, and it
 * only holds strings. A collection with a few hundred copies and cached cover metadata
 * passes that limit quickly.
 */
/**
 * A pending answer to "why does this copy exist", waiting for the next push.
 *
 * Only the device can answer it: an import of two hundred records and two hundred typed in
 * over a fortnight reach the server in exactly the same shape.
 */
interface CopyOriginRow {
  readonly id: string;
  readonly origin: CopyOrigin;
}

export type CopyOrigin = "MANUAL" | "CSV_IMPORT" | "FIRST_SYNC";

/**
 * The part of the store the sync transport needs in order to say why a copy exists.
 *
 * A separate interface rather than the whole Dexie class, so an in-memory store in a test
 * can leave it out entirely. A transport with nothing to read simply sends no origins,
 * which the server reads as silence — the same safe default as an older client.
 */
export interface OriginJournal {
  rememberOrigins(ids: readonly string[], origin: CopyOrigin): Promise<void>;
  readOrigins(): Promise<Record<string, CopyOrigin>>;
  forgetOrigins(ids: readonly string[]): Promise<void>;
}

/**
 * Records an origin if this store keeps one.
 *
 * Callers hold a `LocalStore`, which is the contract shared with the mobile app and has no
 * business knowing about feeds. Rather than widen it, the add paths ask politely and carry
 * on when the answer is no.
 */
export async function rememberCopyOrigins(
  store: unknown,
  ids: readonly string[],
  origin: CopyOrigin,
): Promise<void> {
  const journal = store as Partial<OriginJournal>;
  if (typeof journal.rememberOrigins !== "function" || ids.length === 0) {
    return;
  }
  await journal.rememberOrigins(ids, origin);
}

export class DexieLocalStore implements LocalStore {
  private readonly db = new MusicCollectorDb();

  async open(): Promise<void> {
    await this.db.open();
  }

  /** Records why some copies were created, for the next push to pass on. */
  async rememberOrigins(ids: readonly string[], origin: CopyOrigin): Promise<void> {
    await this.db.copyOrigins.bulkPut(ids.map((id) => ({ id, origin })));
  }

  async readOrigins(): Promise<Record<string, CopyOrigin>> {
    const rows = await this.db.copyOrigins.toArray();
    return Object.fromEntries(rows.map((row) => [row.id, row.origin]));
  }

  /**
   * Forgets the answers the server has now been given.
   *
   * Cleared after the push rather than before it: a push that fails has to be able to say
   * the same thing again, or a record added offline would go quiet purely because the
   * first attempt was made on a train.
   */
  async forgetOrigins(ids: readonly string[]): Promise<void> {
    await this.db.copyOrigins.bulkDelete([...ids]);
  }

  async listCopies(filter: LibraryFilter = {}): Promise<Copy[]> {
    const copies = await this.db.copies.filter((copy) => copy.deletedAt === null).toArray();
    const releases = await this.getReleases(copies.map((copy) => copy.releaseId));

    const matching = copies.filter((copy) => {
      const release = releases.get(copy.releaseId);
      if (
        filter.format !== undefined &&
        filter.format !== "ALL" &&
        copyFormat(copy, release) !== filter.format
      ) {
        return false;
      }
      // A grade the copy has never been given is not "Good" — an ungraded copy drops out
      // of every grade filter rather than defaulting into the mildest one.
      if (
        filter.condition !== undefined &&
        filter.condition !== null &&
        copy.condition !== filter.condition
      ) {
        return false;
      }
      const term = filter.search?.trim().toLowerCase();
      if (term === undefined || term === "") return true;
      const haystack = [release?.title, release?.artistName, release?.catalogNumber, copy.notes]
        .filter((part): part is string => typeof part === "string")
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });

    return sortCopies(matching, releases, filter.sort ?? "ADDED_DESC");
  }

  async getCopy(id: string): Promise<Copy | undefined> {
    const copy = await this.db.copies.get(id);
    return copy?.deletedAt === null ? copy : undefined;
  }

  async getCopyIncludingDeleted(id: string): Promise<Copy | undefined> {
    return this.db.copies.get(id);
  }

  async listCopiesInReleaseGroup(albumId: string): Promise<Copy[]> {
    const copies = await this.db.copies.filter((copy) => copy.deletedAt === null).toArray();
    // A hand-entered pressing is its own album, so it is found by its own id rather than
    // in the mirror — which never holds a row for it.
    const manualCopyId = manualReleaseCopyId(albumId);
    if (manualCopyId !== null) {
      return copies.filter((copy) => copy.id === manualCopyId);
    }
    const releases = await this.db.releaseCache.where("albumId").equals(albumId).toArray();
    const releaseIds = new Set(releases.map((release) => release.id));
    return copies.filter((copy) => releaseIds.has(copy.releaseId));
  }

  async putCopy(copy: Copy): Promise<void> {
    await this.db.copies.put(copy);
    await this.markPending(copy.id);
  }

  /**
   * A whole arranged shelf, as one write and one pass over the pending list.
   *
   * `putCopy` in a loop re-reads and re-writes the pending ids once per record, which is
   * quadratic — and the first drag on a shelf that has never been arranged writes to
   * every record on it.
   */
  async putCopies(copies: readonly Copy[]): Promise<void> {
    if (copies.length === 0) return;
    await this.db.copies.bulkPut([...copies]);
    const pending = new Set(await this.readPendingIds());
    for (const copy of copies) pending.add(copy.id);
    await this.writePendingIds([...pending]);
  }

  async adoptCopy(copy: Copy): Promise<void> {
    await this.db.copies.put(copy);
  }

  /** One pending set for copies and wishes alike — they push in the same batch. */
  private async markPending(id: string): Promise<void> {
    const pending = new Set(await this.readPendingIds());
    if (pending.has(id)) return;
    pending.add(id);
    await this.writePendingIds([...pending]);
  }

  /**
   * Refreshes the catalogue rows, without letting a refresh take anything away.
   *
   * A `coverArtUrl` of null means two different things — this pressing has no artwork, and
   * the server could not find out — and until it was taught the difference the server wrote
   * a cover probe that timed out down as the first. The client then cached the null over the
   * URL it already had, so a record lost its sleeve everywhere at once with nothing to bring
   * it back. Reported from the field after an evening of scanning CDs.
   *
   * So a cover is kept once it is known. The worst this can do is hold on to an address that
   * has stopped resolving, which `ReleaseArt` already survives.
   *
   * The same rule as `mergeCachedRelease` in the shared package, inlined only because this
   * app is still on an earlier release of it. Mirrored by
   * rekordo-mobile/src/local/sqliteStore.ts.
   */
  async cacheReleases(releases: readonly Release[]): Promise<void> {
    const held = await this.db.releaseCache.bulkGet(releases.map((release) => release.id));
    await this.db.releaseCache.bulkPut(
      releases.map((release, index) => {
        const known = held[index]?.coverArtUrl;
        return release.coverArtUrl !== null || known == null
          ? release
          : { ...release, coverArtUrl: known };
      }),
    );
  }

  async getRelease(releaseId: string): Promise<Release | undefined> {
    const copyId = manualReleaseCopyId(releaseId);
    if (copyId !== null) {
      const copy = await this.db.copies.get(copyId);
      return copy === undefined ? undefined : manualRelease(copy);
    }
    return this.db.releaseCache.get(releaseId);
  }

  /**
   * The releases these ids stand for — cached ones from the mirror, hand-entered ones
   * derived from the copies that describe them.
   *
   * A manual release is never cached: its facts are mergeable fields on the copy, so a row
   * written once would go stale the moment another device corrected the title. Deriving on
   * read also means a device that pulled the copy and has an empty mirror still resolves it.
   */
  async getReleases(releaseIds: readonly string[]): Promise<Map<string, Release>> {
    if (releaseIds.length === 0) return new Map();
    const ids = [...new Set(releaseIds)];
    const manualCopyIds = ids.map(manualReleaseCopyId).filter((id): id is string => id !== null);

    const [rows, manualCopies] = await Promise.all([
      this.db.releaseCache.bulkGet(ids.filter((id) => !isManualReleaseId(id))),
      manualCopyIds.length === 0 ? Promise.resolve([]) : this.db.copies.bulkGet(manualCopyIds),
    ]);

    const found = new Map<string, Release>(
      rows.filter((row): row is Release => row !== undefined).map((row) => [row.id, row]),
    );
    for (const copy of manualCopies) {
      if (copy !== undefined) found.set(manualReleaseId(copy.id), manualRelease(copy));
    }
    return found;
  }

  async listPhotos(copyId: string): Promise<Photo[]> {
    const photos = await this.db.photos.where("copyId").equals(copyId).toArray();
    return photos
      .filter((photo) => photo.deletedAt === null)
      .sort((a, b) => a.sortIndex - b.sortIndex);
  }

  async listCoverPhotos(copyIds: readonly string[]): Promise<Map<string, Photo>> {
    // anyOf on an empty list is legal but pointless, and the callers hit it on first paint.
    if (copyIds.length === 0) return new Map();
    const photos = await this.db.photos
      .where("copyId")
      .anyOf(copyIds as string[])
      .toArray();

    const first = new Map<string, Photo>();
    for (const photo of photos) {
      if (photo.deletedAt !== null || photo.copyId === null) continue;
      const held = first.get(photo.copyId);
      if (held === undefined || photo.sortIndex < held.sortIndex) first.set(photo.copyId, photo);
    }
    return first;
  }

  async listWishPhotos(wishIds: readonly string[]): Promise<Map<string, Photo>> {
    // anyOf on an empty list is legal but pointless, and the callers hit it on first paint.
    if (wishIds.length === 0) return new Map();
    const photos = await this.db.photos
      .where("wishId")
      .anyOf(wishIds as string[])
      .toArray();

    const covers = new Map<string, Photo>();
    for (const photo of photos) {
      if (photo.deletedAt !== null || photo.wishId === null) continue;
      const held = covers.get(photo.wishId);
      // Newest wins: replacing a picture writes a second one, and the tombstone of the
      // first may not have been written yet on the device that pulled the replacement.
      if (held === undefined || photo.createdAt > held.createdAt) covers.set(photo.wishId, photo);
    }
    return covers;
  }

  /** Every live photo, whoever owns it — the whole-shelf read the `.mc` export needs. */
  async listAllPhotos(): Promise<Photo[]> {
    const photos = await this.db.photos.filter((photo) => photo.deletedAt === null).toArray();
    return photos.sort((a, b) => a.sortIndex - b.sortIndex);
  }

  async getPhotoIncludingDeleted(id: string): Promise<Photo | undefined> {
    return this.db.photos.get(id);
  }

  async listPhotosAwaitingUpload(): Promise<Photo[]> {
    const photos = await this.db.photos
      .filter((photo) => photo.storageKey === null && photo.deletedAt === null)
      .toArray();
    // Only those whose bytes are actually here; a photo pulled from another device has no
    // local bytes to upload and nothing to do.
    const withBytes: Photo[] = [];
    for (const photo of photos) {
      if ((await this.db.photoBytes.get(photo.id)) !== undefined) withBytes.push(photo);
    }
    return withBytes;
  }

  async putPhoto(photo: Photo): Promise<void> {
    await this.db.photos.put(photo);
    await this.markPending(photo.id);
  }

  async adoptPhoto(photo: Photo): Promise<void> {
    await this.db.photos.put(photo);
  }

  async putPhotoBytes(id: string, buffer: ArrayBuffer, contentType: string): Promise<void> {
    await this.db.photoBytes.put({ id, buffer, contentType });
  }

  async getPhotoBytes(id: string): Promise<Blob | undefined> {
    const row = await this.db.photoBytes.get(id);
    return row === undefined ? undefined : new Blob([row.buffer], { type: row.contentType });
  }

  /**
   * Whether the bytes are here, without reading them.
   *
   * Counted rather than fetched: `get` would materialise the whole buffer, and the sync
   * sweep asks this about every photo in the collection on every pass.
   */
  async hasPhotoBytes(id: string): Promise<boolean> {
    return (await this.db.photoBytes.where(":id").equals(id).count()) > 0;
  }

  /**
   * The stored bytes themselves, without the `Blob` wrapper `getPhotoBytes` puts on them.
   *
   * The archive wants bytes; every screen wants a Blob to point an `<img>` at. Dexie holds
   * the buffer either way, so the export reads the row directly rather than building a
   * Blob only to take it apart again — which is also the only route that works where
   * `Blob.arrayBuffer` is missing.
   */
  async photoBuffer(id: string): Promise<ArrayBuffer | undefined> {
    return (await this.db.photoBytes.get(id))?.buffer;
  }

  async deletePhotoBytes(id: string): Promise<void> {
    await this.db.photoBytes.delete(id);
  }

  /**
   * Scanned, kept, and still nameless.
   *
   * Filtered rather than indexed: `pendingBarcode` is null on all but the handful of rows
   * a shopping trip without signal produced, so an index would be almost entirely empty
   * and Dexie would still walk the table to build it.
   */
  async listPendingScans(): Promise<{ copies: Copy[]; wishes: WishlistItem[] }> {
    const pending = (record: { pendingBarcode: string | null; deletedAt: number | null }) =>
      record.deletedAt === null && record.pendingBarcode !== null;
    return {
      copies: await this.db.copies.filter(pending).toArray(),
      wishes: await this.db.wishlist.filter(pending).toArray(),
    };
  }

  async listWishlist(): Promise<WishlistItem[]> {
    const items = await this.db.wishlist.filter((item) => item.deletedAt === null).toArray();
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getWishlistItemIncludingDeleted(id: string): Promise<WishlistItem | undefined> {
    return this.db.wishlist.get(id);
  }

  async putWishlistItem(item: WishlistItem): Promise<void> {
    await this.db.wishlist.put(item);
    await this.markPending(item.id);
  }

  async adoptWishlistItem(item: WishlistItem): Promise<void> {
    await this.db.wishlist.put(item);
  }

  async wishlistHas(albumId: string): Promise<boolean> {
    const matches = await this.db.wishlist.where("albumId").equals(albumId).toArray();
    return matches.some((item) => item.deletedAt === null);
  }

  async stats(): Promise<CollectionStats> {
    const copies = await this.db.copies.filter((copy) => copy.deletedAt === null).toArray();
    const releases = await this.getReleases(copies.map((copy) => copy.releaseId));
    return computeStats(copies, releases);
  }

  async deviceId(): Promise<string> {
    const existing = await this.db.meta.get(DEVICE_ID_KEY);
    if (existing !== undefined) return existing.value;
    const generated = crypto.randomUUID();
    await this.db.meta.put({ key: DEVICE_ID_KEY, value: generated });
    return generated;
  }

  async readClock(): Promise<string | undefined> {
    return (await this.db.meta.get(CLOCK_KEY))?.value;
  }

  async writeClock(encoded: string): Promise<void> {
    await this.db.meta.put({ key: CLOCK_KEY, value: encoded });
  }

  async readSyncCursor(): Promise<number> {
    const row = await this.db.meta.get(CURSOR_KEY);
    return row === undefined ? 0 : Number.parseInt(row.value, 10);
  }

  async writeSyncCursor(cursor: number): Promise<void> {
    await this.db.meta.put({ key: CURSOR_KEY, value: String(cursor) });
  }

  async readPendingIds(): Promise<string[]> {
    const row = await this.db.meta.get(PENDING_KEY);
    return row === undefined ? [] : (JSON.parse(row.value) as string[]);
  }

  async writePendingIds(ids: readonly string[]): Promise<void> {
    await this.db.meta.put({ key: PENDING_KEY, value: JSON.stringify(ids) });
  }

  async readSetting(key: string): Promise<string | undefined> {
    return (await this.db.meta.get(`${SETTING_PREFIX}${key}`))?.value;
  }

  async writeSetting(key: string, value: string): Promise<void> {
    await this.db.meta.put({ key: `${SETTING_PREFIX}${key}`, value });
  }
}

/** Exported for testing — pure, so it needs no IndexedDB. */
export function computeStats(
  copies: readonly Copy[],
  releases: ReadonlyMap<string, Release>,
): CollectionStats {
  const byFormat = Object.fromEntries(FORMATS.map((format) => [format, 0])) as Record<
    Format,
    number
  >;
  const releaseGroups = new Set<string>();
  let totalSpentCents = 0;

  for (const copy of copies) {
    const release = releases.get(copy.releaseId);
    // The copy's own format, so the shelf chip and its count can never disagree.
    byFormat[copyFormat(copy, release)] += 1;
    if (release !== undefined) releaseGroups.add(release.albumId);
    totalSpentCents += copy.pricePaidCents ?? 0;
  }

  return {
    copyCount: copies.length,
    releaseGroupCount: releaseGroups.size,
    totalSpentCents,
    // Rounded, and guarded against the empty collection the profile screen starts at.
    averageSpentCents: copies.length === 0 ? 0 : Math.round(totalSpentCents / copies.length),
    byFormat,
  };
}

/** Exported for testing — pure. */
export function sortCopies(
  copies: readonly Copy[],
  releases: ReadonlyMap<string, Release>,
  sort: NonNullable<LibraryFilter["sort"]>,
): Copy[] {
  const sorted = [...copies];
  switch (sort) {
    case "ARTIST_ASC":
      return sorted.sort((a, b) =>
        (releases.get(a.releaseId)?.artistName ?? "").localeCompare(
          releases.get(b.releaseId)?.artistName ?? "",
        ),
      );
    case "YEAR_DESC":
      return sorted.sort(
        (a, b) => (releases.get(b.releaseId)?.year ?? 0) - (releases.get(a.releaseId)?.year ?? 0),
      );
    case "ADDED_DESC":
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    // The shelf as somebody arranged it. The rule is the shared package's, not a second
    // opinion about it: a copy never placed by hand sorts after every copy that has been,
    // newest first among those.
    case "MANUAL":
      return sorted.sort(compareManualOrder);
  }
}
