import type { Album, Release } from "@janne6565/rekordo-shared";

/**
 * An album, shaped as the release a copy of it would have had.
 *
 * The sheet, the shelf and the local mirror all describe a copy through a `Release`. A copy
 * whose owner never chose a pressing has none, so its facts are read from the album under
 * the album's own id -- which is why this keeps `id` and `albumId` the same value. The
 * server does exactly this in `MetadataService.asUnpressedRelease`, so the row a second
 * device pulls looks like the one that made it.
 *
 * Everything only a pressing can know is null, which is the truthful answer rather than a
 * placeholder: nobody said. `OTHER` is the format for the same reason, and the chips in the
 * sheet are where somebody says otherwise about the object in their hands.
 *
 * A copy of the mobile app's helper of the same name, field for field, so a record added
 * on either client leaves the same row behind. It is pure and belongs in the shared
 * package; until it moves there, change both or neither.
 */
export function albumAsRelease(album: Album, cachedAt: number): Release {
  return {
    id: album.albumId,
    albumId: album.albumId,
    title: album.title,
    artistName: album.artistName,
    year: album.year,
    format: "OTHER",
    label: null,
    catalogNumber: null,
    country: null,
    barcode: null,
    releaseDate: null,
    trackCount: null,
    discCount: null,
    coverArtUrl: album.coverArtUrl,
    coverTheme: null,
    cachedAt,
  };
}
