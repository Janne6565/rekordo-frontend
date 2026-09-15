import type {
  ReleaseDto,
  SyncCopyDto,
  SyncPhotoDto,
  SyncWishDto,
} from "@/api/generated/rekordoAPI.schemas";
import { pull, push } from "@/api/generated/sync/sync";
import { downloadPhotoBytes, uploadPhotoBytes } from "@/api/photos";
import { lookupReleases } from "@/api/releases";
import type { CopyOrigin, OriginJournal } from "@/local/dexieStore";
import type {
  ClockSource,
  Copy,
  LocalStore,
  Photo,
  PushResult,
  Release,
  SyncPage,
  SyncTransport,
  WishlistItem,
} from "@janne6565/rekordo-shared";
import { SyncEngine } from "@janne6565/rekordo-shared";

/**
 * The web app's half of sync: the Orval client, and the DTO shapes it speaks.
 *
 * springdoc types every field optional, so a record coming back from the server is
 * validated here before it is allowed anywhere near the store — a malformed row is
 * dropped rather than written. The reconciliation itself is in the shared package, which
 * only ever sees domain records; this file is the seam between the two.
 */

function wishToDto(item: WishlistItem): SyncWishDto {
  return {
    id: item.id,
    albumId: item.albumId,
    releaseId: item.releaseId ?? undefined,
    pendingBarcode: item.pendingBarcode ?? undefined,
    title: item.title,
    artistName: item.artistName,
    year: item.year ?? undefined,
    desiredFormat: item.desiredFormat ?? undefined,
    note: item.note ?? undefined,
    sortIndex: item.sortIndex ?? undefined,
    createdAt: item.createdAt,
    deletedAt: item.deletedAt ?? undefined,
    fieldClocks: item.fieldClocks,
  };
}

/**
 * A catalogue row on its way up to the mirror.
 *
 * The sampled palette is deliberately not sent: it is something the server works out from
 * the cover bytes it fetched itself, and a client echoing one back would be guessing on
 * behalf of every other reader of that release.
 */
function releaseToDto(release: Release): ReleaseDto {
  return {
    id: release.id,
    albumId: release.albumId,
    title: release.title,
    artistName: release.artistName,
    year: release.year ?? undefined,
    format: release.format,
    label: release.label ?? undefined,
    catalogNumber: release.catalogNumber ?? undefined,
    country: release.country ?? undefined,
    barcode: release.barcode ?? undefined,
    releaseDate: release.releaseDate ?? undefined,
    trackCount: release.trackCount ?? undefined,
    discCount: release.discCount ?? undefined,
    coverArtUrl: release.coverArtUrl ?? undefined,
  };
}

function photoToDto(photo: Photo): SyncPhotoDto {
  return {
    id: photo.id,
    copyId: photo.copyId ?? undefined,
    wishId: photo.wishId ?? undefined,
    storageKey: photo.storageKey ?? undefined,
    contentType: photo.contentType,
    byteSize: photo.byteSize,
    sortIndex: photo.sortIndex,
    createdAt: photo.createdAt,
    deletedAt: photo.deletedAt ?? undefined,
    fieldClocks: photo.fieldClocks,
  };
}

export function photoFromDto(dto: SyncPhotoDto): Photo | null {
  // An owner is required, but which one is not: a photo pictures a copy or a wishlist
  // entry. A row naming neither is unreachable and is dropped rather than stored.
  if (
    dto.id == null ||
    (dto.copyId == null && dto.wishId == null) ||
    dto.createdAt == null ||
    dto.fieldClocks == null
  ) {
    return null;
  }
  return {
    id: dto.id,
    copyId: dto.copyId ?? null,
    wishId: dto.wishId ?? null,
    storageKey: dto.storageKey ?? null,
    contentType: dto.contentType ?? "image/jpeg",
    byteSize: dto.byteSize ?? 0,
    sortIndex: dto.sortIndex ?? 0,
    createdAt: dto.createdAt,
    deletedAt: dto.deletedAt ?? null,
    fieldClocks: dto.fieldClocks as Photo["fieldClocks"],
  };
}

export function wishFromDto(dto: SyncWishDto): WishlistItem | null {
  if (
    dto.id == null ||
    dto.albumId == null ||
    dto.title == null ||
    dto.artistName == null ||
    dto.createdAt == null ||
    dto.fieldClocks == null
  ) {
    return null;
  }
  return {
    id: dto.id,
    albumId: dto.albumId,
    // Absent means a server older than the field, which reads as no pressing picked.
    releaseId: dto.releaseId ?? null,
    pendingBarcode: dto.pendingBarcode ?? null,
    title: dto.title,
    artistName: dto.artistName,
    year: dto.year ?? null,
    desiredFormat: (dto.desiredFormat ?? null) as WishlistItem["desiredFormat"],
    note: dto.note ?? null,
    sortIndex: dto.sortIndex ?? null,
    createdAt: dto.createdAt,
    deletedAt: dto.deletedAt ?? null,
    fieldClocks: dto.fieldClocks as WishlistItem["fieldClocks"],
  };
}

function toDto(copy: Copy): SyncCopyDto {
  return {
    id: copy.id,
    releaseId: copy.releaseId,
    pendingBarcode: copy.pendingBarcode ?? undefined,
    manualTitle: copy.manualTitle ?? undefined,
    manualArtist: copy.manualArtist ?? undefined,
    manualYear: copy.manualYear ?? undefined,
    manualLabel: copy.manualLabel ?? undefined,
    manualCatalogNumber: copy.manualCatalogNumber ?? undefined,
    manualFormat: copy.manualFormat ?? undefined,
    condition: copy.condition ?? undefined,
    sleeveCondition: copy.sleeveCondition ?? undefined,
    // Always sent, unlike the nullable fields: false is a real answer here, and dropping
    // it would leave a server that had been told `true` never hearing it undone.
    catalogArt: copy.catalogArt,
    pricePaidCents: copy.pricePaidCents ?? undefined,
    currency: copy.currency,
    purchasedOn: copy.purchasedOn ?? undefined,
    purchasedAt: copy.purchasedAt ?? undefined,
    notes: copy.notes ?? undefined,
    notesConflict: copy.notesConflict ?? undefined,
    rating: copy.rating ?? undefined,
    // Always sent, never `?? undefined`: an omitted boolean would leave a server that had
    // been told `true` never hearing it undone. Same reasoning as `catalogArt` above.
    hidden: copy.hidden,
    // Null is a real value here — "never placed by hand" — and it has to travel, or a
    // shelf whose arrangement was cleared on one device would never be cleared anywhere
    // else. `?? undefined` would drop exactly that.
    sortIndex: copy.sortIndex,
    createdAt: copy.createdAt,
    deletedAt: copy.deletedAt ?? undefined,
    fieldClocks: copy.fieldClocks,
  };
}

/**
 * Nothing the server sends is guaranteed by its type — every field is `?: T | null` — so a
 * record is validated here before it is allowed anywhere near the local store: a malformed
 * row should be dropped, not written. `== null` throughout, because absent and null are the
 * same answer on this wire and a row missing an id is unusable either way.
 */
export function fromDto(dto: SyncCopyDto): Copy | null {
  if (
    dto.id == null ||
    dto.releaseId == null ||
    dto.currency == null ||
    dto.createdAt == null ||
    dto.fieldClocks == null
  ) {
    return null;
  }
  return {
    id: dto.id,
    releaseId: dto.releaseId,
    pendingBarcode: dto.pendingBarcode ?? null,
    manualTitle: dto.manualTitle ?? null,
    manualArtist: dto.manualArtist ?? null,
    manualYear: dto.manualYear ?? null,
    manualLabel: dto.manualLabel ?? null,
    manualCatalogNumber: dto.manualCatalogNumber ?? null,
    manualFormat: (dto.manualFormat ?? null) as Copy["manualFormat"],
    condition: (dto.condition ?? null) as Copy["condition"],
    sleeveCondition: (dto.sleeveCondition ?? null) as Copy["sleeveCondition"],
    // Absent means a server older than the field, which is the same as not preferring it.
    catalogArt: (dto.catalogArt ?? "AUTO") as Copy["catalogArt"],
    pricePaidCents: dto.pricePaidCents ?? null,
    currency: dto.currency,
    purchasedOn: dto.purchasedOn ?? null,
    purchasedAt: dto.purchasedAt ?? null,
    notes: dto.notes ?? null,
    notesConflict: dto.notesConflict ?? null,
    rating: dto.rating ?? null,
    // Absent means a server older than the field, which reads as not hidden.
    hidden: dto.hidden ?? false,
    // Absent means a server older than the field, which reads as never placed by hand.
    sortIndex: dto.sortIndex ?? null,
    createdAt: dto.createdAt,
    deletedAt: dto.deletedAt ?? null,
    fieldClocks: dto.fieldClocks as Copy["fieldClocks"],
  };
}

function toPage(
  page: {
    copies?: SyncCopyDto[] | null;
    wishes?: SyncWishDto[] | null;
    photos?: SyncPhotoDto[] | null;
    cursor?: number | null;
    hasMore?: boolean | null;
  },
  cursor: number,
): SyncPage {
  return {
    copies: (page.copies ?? []).map(fromDto).filter((copy): copy is Copy => copy !== null),
    wishes: (page.wishes ?? [])
      .map(wishFromDto)
      .filter((wish): wish is WishlistItem => wish !== null),
    photos: (page.photos ?? []).map(photoFromDto).filter((photo): photo is Photo => photo !== null),
    cursor: page.cursor ?? cursor,
    hasMore: page.hasMore === true,
  };
}

/**
 * A store that may or may not keep the origin journal. Optional rather than required so a
 * test double, or any store that has no use for feeds, still satisfies it.
 */
type SyncStore = LocalStore & Partial<OriginJournal>;

export function createSyncTransport(store: SyncStore): SyncTransport {
  return {
    async pull(cursor: number): Promise<SyncPage> {
      return toPage(await pull({ since: cursor }), cursor);
    },

    async push(copies, wishes, photos, releases): Promise<PushResult> {
      /*
       * Why each copy exists, answered beside the records rather than on them.
       *
       * The server cannot work this out for itself — an import and a fortnight of typing
       * arrive in the same shape — and it is what keeps a CSV file and the first sign-in
       * push out of everybody's feed. Only ids in this batch are sent, so a stale answer
       * about a copy that is not being pushed cannot ride along.
       */
      const remembered: Record<string, CopyOrigin> = (await store.readOrigins?.()) ?? {};
      const origins = Object.fromEntries(
        copies
          .map((copy) => copy.id)
          .filter((id) => remembered[id] !== undefined)
          .map((id) => [id, remembered[id]]),
      );

      const response = await push({
        copies: copies.map(toDto),
        wishes: wishes.map(wishToDto),
        photos: photos.map(photoToDto),
        // The catalogue behind these copies, which the mirror may never have seen: it only
        // learns of a release when somebody looks one up through the metadata proxy, and a
        // Discogs id it is missing can never be fetched by id at all.
        releases: releases.map(releaseToDto),
        origins,
      });

      // Only after the server has answered: a push that failed has to be able to say the
      // same thing again, or a record added on a train would go quiet for good.
      await store.forgetOrigins?.(Object.keys(origins));

      const page = toPage(response, 0);
      return {
        copies: page.copies,
        wishes: page.wishes,
        photos: page.photos,
        cursor: response.cursor ?? 0,
      };
    },

    /**
     * Null rather than a throw when the bytes are not on this device: that is not a
     * failure, it is a photo whose turn has not come, and the next sync tries again.
     */
    async uploadPhoto(photo) {
      const bytes = await store.getPhotoBytes(photo.id);
      if (bytes === undefined) return null;
      // Whichever owner the photo carries: the server takes one and refuses both.
      return uploadPhotoBytes(
        photo.id,
        photo.copyId === null ? { wishId: photo.wishId as string } : { copyId: photo.copyId },
        bytes,
      );
    },

    /**
     * The catalogue behind the copies that just arrived. It does not travel inside a sync
     * batch — a release is a shared cache, not somebody's record — so the engine asks for
     * it separately, and without this a device that has only ever pulled draws a shelf of
     * untitled placeholders.
     */
    async fetchReleases(releaseIds) {
      return lookupReleases(releaseIds);
    },

    async downloadPhoto(photo) {
      const bytes = await downloadPhotoBytes(photo.id);
      await store.putPhotoBytes(photo.id, await bytes.arrayBuffer(), photo.contentType);
    },
  };
}

/** Told about each sync page as it arrives, before the engine applies it. */
export interface PullObserver {
  readonly onPage: (page: SyncPage) => void;
}

/**
 * The engine, wired to this app's transport. Every caller goes through here.
 *
 * The observer sits on the transport rather than in the engine so the shared package does
 * not grow a progress API for the one screen that wants it (loading 1b).
 */
export function createSyncEngine(
  store: SyncStore,
  clock: ClockSource,
  observer?: PullObserver,
): SyncEngine {
  const transport = createSyncTransport(store);
  if (observer === undefined) return new SyncEngine(store, clock, transport);
  return new SyncEngine(store, clock, {
    ...transport,
    async pull(cursor) {
      const page = await transport.pull(cursor);
      observer.onPage(page);
      return page;
    },
  });
}
