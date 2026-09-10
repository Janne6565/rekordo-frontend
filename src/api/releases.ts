import {
  albumCovers,
  albumsOfArtist,
  artistImage,
  findByBarcode,
  getRelease,
  getReleases,
  releasesInGroup,
  search,
  searchArtists,
} from "@/api/generated/metadata/metadata";
import type {
  AlbumDto,
  ArtistDto,
  CoverThemeDto,
  ReleaseDto,
} from "@/api/generated/rekordoAPI.schemas";
import type {
  Album,
  Artist,
  CoverTheme,
  Format,
  LocalStore,
  Release,
} from "@janne6565/rekordo-shared";
import { FORMATS, readArchivedAlbumCovers, withArchivedCovers } from "@janne6565/rekordo-shared";
/**
 * The boundary between the generated client and the domain.
 *
 * Every property the server does not guarantee is generated as `?: T | null`, so the fields
 * a `ReleaseDto` always carries in practice are still typed as maybe-missing. Rather than
 * let that leak into every screen as `!` assertions, payloads are validated once here and
 * anything unusable is dropped — a search that returns one malformed row should show the
 * other nine, not fail.
 *
 * `== null` throughout, never `=== undefined`: absent and null are the same answer on this
 * wire, and a guard that catches only one of them narrows the other to a type it is not.
 */

function toCoverTheme(dto: CoverThemeDto | null | undefined): CoverTheme | null {
  if (
    dto?.dominantColor == null ||
    dto.accentColor == null ||
    dto.lightness == null ||
    dto.dark == null
  ) {
    return null;
  }
  return {
    dominantColor: dto.dominantColor,
    accentColor: dto.accentColor,
    lightness: dto.lightness,
    dark: dto.dark,
  };
}

function isFormat(value: string | null | undefined): value is Format {
  return value != null && (FORMATS as readonly string[]).includes(value);
}

export function toRelease(dto: ReleaseDto, now: number): Release | null {
  // Without these four there is nothing to show and nothing to key a copy on.
  if (dto.id == null || dto.albumId == null || dto.title == null || dto.artistName == null) {
    return null;
  }
  return {
    id: dto.id,
    albumId: dto.albumId,
    title: dto.title,
    artistName: dto.artistName,
    year: dto.year ?? null,
    format: isFormat(dto.format) ? dto.format : "OTHER",
    label: dto.label ?? null,
    catalogNumber: dto.catalogNumber ?? null,
    country: dto.country ?? null,
    barcode: dto.barcode ?? null,
    releaseDate: dto.releaseDate ?? null,
    trackCount: dto.trackCount ?? null,
    discCount: dto.discCount ?? null,
    coverArtUrl: dto.coverArtUrl ?? null,
    coverTheme: toCoverTheme(dto.coverTheme),
    cachedAt: now,
  };
}

export function toReleases(dtos: readonly ReleaseDto[], now: number): Release[] {
  return dtos
    .map((dto) => toRelease(dto, now))
    .filter((release): release is Release => release !== null);
}

/** The subtitle under each search result on the add screen: "Sire · SRK 6095 · US". */
export function releaseDisambiguation(release: Release): string {
  return [release.label, release.catalogNumber, release.country]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" · ");
}

export async function searchReleases(query: string, limit = 25): Promise<Release[]> {
  return toReleases(await search({ q: query, limit }), Date.now());
}

export async function lookupByBarcode(barcode: string): Promise<Release[]> {
  return toReleases(await findByBarcode(barcode), Date.now());
}

export async function lookupRelease(mbid: string): Promise<Release | null> {
  return toRelease(await getRelease(mbid), Date.now());
}

/** Every pressing of one album. Bitches Brew has 47, so this is paged, not exhaustive. */
export async function lookupPressings(albumId: string, limit = 25): Promise<Release[]> {
  return toReleases(await releasesInGroup(albumId, { limit }), Date.now());
}

function toArtist(dto: ArtistDto): Artist | null {
  // Without these two there is nothing to show and nothing to open a discography with.
  if (dto.mbid == null || dto.name == null) return null;
  return {
    mbid: dto.mbid,
    name: dto.name,
    disambiguation: dto.disambiguation ?? "",
    type: dto.type ?? null,
    country: dto.country ?? null,
    beganIn: dto.beganIn ?? null,
    endedIn: dto.endedIn ?? null,
    score: dto.score ?? null,
  };
}

export async function findArtists(query: string, limit = 5): Promise<Artist[]> {
  return (await searchArtists({ q: query, limit }))
    .map(toArtist)
    .filter((artist): artist is Artist => artist !== null);
}

/**
 * One artist's portrait, or null when they have none.
 *
 * Null is a real answer here rather than a failure — plenty of artists have no picture in
 * Discogs at all — so the caller draws the initial and does not retry.
 */
export async function findArtistImage(mbid: string): Promise<string | null> {
  return (await artistImage(mbid)).imageUrl ?? null;
}

function toAlbum(dto: AlbumDto): Album | null {
  if (dto.albumId == null || dto.title == null) return null;
  return {
    albumId: dto.albumId,
    title: dto.title,
    artistName: dto.artistName ?? "",
    year: dto.year ?? null,
    primaryType: dto.primaryType ?? null,
    coverArtUrl: dto.coverArtUrl ?? null,
  };
}

export interface Discography {
  readonly albums: Album[];
  /**
   * How many the query matched upstream, not how many arrived. A chip reading "Albums 51"
   * is telling the truth on a page of 25.
   */
  readonly total: number;
}

export async function lookupDiscography(
  artistMbid: string,
  primaryType: string | null,
  limit = 25,
): Promise<Discography> {
  const dto = await albumsOfArtist(artistMbid, {
    ...(primaryType === null ? {} : { type: primaryType }),
    limit,
  });
  return {
    albums: (dto.albums ?? []).map(toAlbum).filter((album): album is Album => album !== null),
    total: dto.total ?? 0,
  };
}

/**
 * The line under an artist's name: "Group · GB · 2010–present".
 *
 * Built here rather than in the component so the mobile app can mirror it exactly.
 */
export function artistSubtitle(artist: Artist): string {
  const years =
    artist.beganIn === null
      ? null
      : `${artist.beganIn.slice(0, 4)}–${artist.endedIn === null ? "" : artist.endedIn.slice(0, 4)}`;
  return [artist.type, artist.country, years]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" · ");
}

/** The server caps one request at a hundred ids, so a long wishlist asks in pages. */
const COVER_BATCH = 100;

/**
 * The artwork for a set of albums, keyed by the id it was asked for.
 *
 * A wishlist entry names an album rather than a pressing, so it carries no cover of its
 * own and the server resolves one from the pressings it has mirrored. Ids it cannot answer
 * for — hand-entered `local:` albums among them — are simply absent from the map, which is
 * the same thing as a null cover to every caller: `ReleaseArt` draws the format silhouette.
 */
export async function lookupAlbumCovers(
  albumIds: readonly string[],
  store?: LocalStore,
): Promise<ReadonlyMap<string, string | null>> {
  const batches: string[][] = [];
  for (let start = 0; start < albumIds.length; start += COVER_BATCH) {
    batches.push(albumIds.slice(start, start + COVER_BATCH));
  }

  const pages = await Promise.all(batches.map((albumId) => albumCovers({ albumId })));
  const covers = new Map<string, string | null>();
  for (const dto of pages.flat()) {
    if (dto.albumId != null) covers.set(dto.albumId, dto.coverArtUrl ?? null);
  }
  // An imported archive brought the answers the deployment it came from could give. This
  // mirror may never have heard of those albums — that is not a fact about the record, it
  // is a fact about which server is being asked — so the archive fills what comes back
  // null. Optional because a friend's wishlist has no archive of ours to fall back on.
  if (store === undefined) return covers;
  return withArchivedCovers(covers, await readArchivedAlbumCovers(store));
}

/**
 * The artwork of the pressings entries were made from, keyed by release id.
 *
 * The covers endpoint answers about *albums*, and an album cannot say which of its
 * pressings somebody picked — it resolves one itself, by a rule that has nothing to do
 * with what was on screen. So a wish that named a pressing asks about that pressing
 * instead, and only falls back to the album's answer when the mirror has nothing to say.
 *
 * Ids the mirror cannot answer for are simply absent, which every caller reads as "ask
 * the album instead".
 */
export async function lookupPressingCovers(
  releaseIds: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  const releases = await lookupReleases(releaseIds);
  return new Map(releases.map((release) => [release.id, release.coverArtUrl]));
}

/** The same hundred-id cap as the covers endpoint, so a large collection asks in pages. */
const RELEASE_BATCH = 100;

/**
 * The releases behind a set of ids, straight from the mirror.
 *
 * What a device asks for after signing in: sync hands it copies that *name* releases,
 * never the releases themselves, so without this every record on a second browser is an
 * untitled placeholder. Ids the mirror cannot answer for — hand-entered `local:` releases
 * among them — are simply absent, and the caller keeps whatever it had.
 */
export async function lookupReleases(releaseIds: readonly string[]): Promise<Release[]> {
  const batches: string[][] = [];
  for (let start = 0; start < releaseIds.length; start += RELEASE_BATCH) {
    batches.push(releaseIds.slice(start, start + RELEASE_BATCH));
  }

  const pages = await Promise.all(batches.map((releaseId) => getReleases({ releaseId })));
  return toReleases(pages.flat(), Date.now());
}
