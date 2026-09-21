import { albumCoverUrl } from "@/api/releases";
import type { Album } from "@janne6565/rekordo-shared";
import { type CSSProperties, useState } from "react";

/** The hatch a sleeve leaves behind when there is no artwork. Matches FormatThumb's. */
const PAPER: CSSProperties = {
  background: "repeating-linear-gradient(135deg,#e3ded4 0 6px,#eae6de 6px 12px)",
};

/** Drawn over the artwork rather than under it, so a pale sleeve still has an edge. */
const COVER_EDGE: CSSProperties = { boxShadow: "inset 0 0 0 1px rgba(25,23,19,.12)" };

interface AlbumArtProps {
  readonly album: Album;
  /**
   * The side of the square in CSS pixels, which is also what is asked of the catalogue.
   * Pass what the layout actually draws; a wrong number here is a wrong-sized download.
   */
  readonly size: number;
  readonly className?: string;
}

/**
 * A record's sleeve, square, at the size it is drawn.
 *
 * A search result is a record rather than a pressing now, so this shows the artwork
 * instead of the format silhouette a pressing row carries: choosing between records is a
 * visual job, and the sleeve is the thing people recognise. There is no format to draw
 * anyway until somebody says which copy they own.
 *
 * The box keeps its shape whether or not a cover arrives. An answer from Discogs carries
 * one fixed image and often none at all, and a row that collapsed without artwork would
 * make the whole list jump as the slower half of it landed.
 */
export function AlbumArt({ album, size, className }: AlbumArtProps) {
  // A URL is not a promise that anything is behind it: the cover may 404 long after the
  // catalogue said it existed, and the hatch is a better answer than a broken image icon.
  const [broken, setBroken] = useState(false);
  const src = albumCoverUrl(album, size);

  return (
    <div
      className={`relative flex-none overflow-hidden rounded-[3px] ${className ?? ""}`}
      style={{ width: size, height: size, ...PAPER }}
    >
      {src !== null && !broken && (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[3px]" style={COVER_EDGE} />
    </div>
  );
}
