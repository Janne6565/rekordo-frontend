import type { Album } from "@janne6565/rekordo-shared";
import { describe, expect, it } from "vitest";
import { albumAsRelease } from "./albumRelease";

const ALBUM: Album = {
  albumId: "musicbrainz:alb-1",
  title: "ten days",
  artistName: "Fred again..",
  year: 2025,
  primaryType: "Album",
  coverArtUrl: "https://example.test/cover.jpg",
};

describe("an album shaped as a release", () => {
  it("keeps id and albumId the same, which is what makes the lookup work", () => {
    const release = albumAsRelease(ALBUM, 1000);

    // catalogueKeyOf falls back to the album id, so the row has to be cached under it.
    // If these ever diverged, a copy with no pressing would render untitled.
    expect(release.id).toBe(ALBUM.albumId);
    expect(release.albumId).toBe(ALBUM.albumId);
  });

  it("says nothing about the pressing rather than guessing", () => {
    const release = albumAsRelease(ALBUM, 1000);

    expect(release.format).toBe("OTHER");
    expect(release.label).toBeNull();
    expect(release.catalogNumber).toBeNull();
    expect(release.country).toBeNull();
    expect(release.barcode).toBeNull();
  });

  it("carries what the album genuinely knows", () => {
    const release = albumAsRelease(ALBUM, 1000);

    expect(release.title).toBe("ten days");
    expect(release.artistName).toBe("Fred again..");
    expect(release.year).toBe(2025);
    expect(release.coverArtUrl).toBe("https://example.test/cover.jpg");
    expect(release.cachedAt).toBe(1000);
  });
});
