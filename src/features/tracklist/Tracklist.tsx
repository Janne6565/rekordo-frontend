import type { TrackMedium, Tracklist as TracklistData } from "@/api/tracklist";
import {
  PHONE_INLINE_CAP,
  TRACK_ROW_CAP,
  capMedia,
  durationParts,
  knownDurationMs,
  trackDuration,
  trackTotal,
} from "@/features/tracklist/tracklistFormat";
import { useTracklistLogic } from "@/features/tracklist/useTracklistLogic";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, CloudOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const LABEL = "font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-subtle";
const META = "font-mono text-[10px] sm:text-[10.5px] text-ink-subtle/80";
const ROW = "grid grid-cols-[34px_1fr_42px] sm:grid-cols-[38px_1fr_46px] gap-x-2.5 sm:gap-x-3";

export interface TracklistProps {
  /**
   * The release the copy points at. `local:` ids never reach the network.
   *
   * Null as well as undefined: a copy added album-first names no pressing, and the server
   * sends that as an explicit null rather than leaving the field out.
   */
  readonly releaseId: string | null | undefined;
  /**
   * What the sheet already knows, from the release row it is drawn from. The header is
   * true before the titles arrive because of these two, and the wait is sized from them.
   */
  readonly trackCount?: number | null;
  readonly discCount?: number | null;
  /**
   * Somebody else's shelf (26c). Only the wording changes: "the rest of this copy is
   * yours, stored here" is a sentence about your own record and nobody else's.
   */
  readonly shared?: boolean;
  /**
   * The copy this sheet is about, when there is a page to send a long tracklist to (25e).
   *
   * Absent for a wishlist entry and for somebody else's shelf: neither has a copy of its
   * own to hang a URL on, so both keep every row inline however many there are.
   */
  readonly copyId?: string;
}

/**
 * Screens 26a–26e — the titles under the sleeve.
 *
 * A reading surface and nothing more: no playback, no links, nothing to press but the line
 * that reveals a capped box set. The visitor on 26c may have no account at all, and the
 * section is identical for them.
 *
 * The section is always present when the copy points at a catalogue, in every state. An
 * absent tracklist is drawn as a labelled absence rather than hidden, because "this record
 * has no tracklist and never will" is a fact about the record worth reading once.
 */
export function Tracklist({ releaseId, ...rest }: TracklistProps) {
  // A record that names no release has no section, and asks for none of the machinery
  // behind one — a wishlist entry typed in by hand never touches the query client.
  if (releaseId == null) return null;
  return <Section releaseId={releaseId} {...rest} />;
}

function Section({
  releaseId,
  trackCount,
  discCount,
  shared = false,
  copyId,
}: TracklistProps & { readonly releaseId: string }) {
  const { t } = useTranslation();
  const { tracklist, loading, unreachable, retry } = useTracklistLogic(releaseId);
  const [expanded, setExpanded] = useState(false);

  // The count outlives every state: it comes from the release row, so it is already true
  // while the rows are grey and it is still true when the titles never arrive.
  const counted = tracklist === undefined ? null : trackTotal(tracklist.media);
  const tracks =
    counted !== null && counted > 0 ? counted : (tracklist?.trackCount ?? trackCount ?? null);
  const discs = tracklist?.media.length || (tracklist?.discCount ?? discCount ?? null);
  // Ten or fewer stay inline on the phone as in the app; past that the rows plus a pinned
  // save bar leave nothing to read, and the list earns a page and a URL of its own.
  const long = copyId !== undefined && tracks !== null && tracks > PHONE_INLINE_CAP;

  return (
    <section className="mt-5 border-t border-line pt-4.5 sm:mt-6.5 sm:pt-5.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={LABEL}>{t("tracklist.label")}</span>
        <Summary tracks={tracks} discs={discs} media={tracklist?.media} loading={loading} />
      </div>

      {loading ? (
        <Skeleton rows={Math.min(tracks ?? 8, TRACK_ROW_CAP)} />
      ) : unreachable ? (
        <Unreachable shared={shared} onRetry={retry} />
      ) : tracklist === undefined || tracklist.absence !== null ? (
        <Absent tracklist={tracklist} />
      ) : (
        <>
          {/*
           * 25e, both forms rendered so CSS picks one. Whether a tracklist is long is a
           * fact about the data and whether the screen is narrow is a fact about the
           * viewport, and only the first of those is knowable here — so the long case
           * draws the rows *and* the way to the page, and the breakpoint hides one.
           */}
          <Rows
            media={tracklist.media}
            expanded={expanded}
            onExpand={() => setExpanded(true)}
            className={long ? "max-sm:hidden" : undefined}
          />
          {long && <PhonePageLink copyId={copyId as string} tracks={tracks} />}
        </>
      )}
    </section>
  );
}

/** "26 tracks · 2 discs · 81 min", and its shorter phone form (26d). */
function Summary({
  tracks,
  discs,
  media,
  loading,
}: {
  readonly tracks: number | null;
  readonly discs: number | null;
  readonly media: readonly TrackMedium[] | undefined;
  readonly loading: boolean;
}) {
  const { t } = useTranslation();

  if (tracks === null && !loading) {
    return <span className="font-mono text-[10px] text-ink-subtle/70">{t("tracklist.none")}</span>;
  }

  const totalMs = media === undefined ? null : knownDurationMs(media);
  const parts: string[] = [];
  const short: string[] = [];
  if (tracks !== null) {
    parts.push(t("tracklist.tracks", { count: tracks }));
    short.push(String(tracks));
  }
  // A single-medium release says nothing about discs: its format is already in the facts
  // above, and "1 disc" is a fact nobody was missing.
  if (discs !== null && discs > 1) {
    parts.push(t("tracklist.discs", { count: discs }));
    short.push(t("tracklist.discs", { count: discs }));
  }
  if (loading) {
    parts.push(t("tracklist.reading"));
    short.push(t("tracklist.reading"));
  } else if (totalMs !== null) {
    const { hours, minutes } = durationParts(totalMs);
    const duration =
      hours > 0
        ? t("tracklist.hoursMinutes", { hours, minutes })
        : t("tracklist.minutes", { count: minutes });
    parts.push(duration);
    short.push(duration);
  }

  return (
    <span className={`${META} ${loading ? "animate-pulse" : ""} shrink-0`}>
      <span className="sm:hidden">{short.join(" · ")}</span>
      <span className="max-sm:hidden">{parts.join(" · ")}</span>
    </span>
  );
}

export function Rows({
  media,
  expanded,
  onExpand,
  className,
}: {
  readonly media: readonly TrackMedium[];
  readonly expanded: boolean;
  readonly onExpand: () => void;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  const { shown, hidden } = expanded ? { shown: [...media], hidden: 0 } : capMedia(media);
  // One disc needs no heading — the format is stated in the facts above the section.
  const headed = media.length > 1;

  return (
    <div className={`mt-1 ${className ?? ""}`}>
      {shown.map((medium) => (
        <div key={medium.position}>
          {headed && (
            <div className="px-0 pt-3.5 pb-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-subtle sm:pt-4.5">
              {[
                t("tracklist.medium", {
                  format: medium.format ?? t("tracklist.disc"),
                  position: medium.position,
                  total: media.length,
                }),
                medium.title,
              ]
                .filter((part) => part !== null && part !== "")
                .join(" · ")}
            </div>
          )}
          {medium.tracks.map((track) => (
            <div
              key={`${medium.position}-${track.number}-${track.title}`}
              className={`${ROW} items-baseline border-t border-ink/7 py-1.5`}
            >
              <span className="font-mono text-[10.5px] tracking-[0.04em] text-ink-subtle sm:text-[11px]">
                {track.number}
              </span>
              <span className="min-w-0">
                {/* Wrapped, never truncated: a classical movement title cut at its colon
                    is worse than three lines of type, and there is no tooltip to invent. */}
                <span className="block text-[12.5px] leading-[1.4] font-medium text-pretty sm:text-[13px] sm:leading-[1.45]">
                  {track.title}
                </span>
                {track.artistName !== null && (
                  <span className="mt-0.5 block text-[11.5px] leading-[1.35] text-ink-muted">
                    {track.artistName}
                  </span>
                )}
              </span>
              {/* Tabular and right-aligned, so a missing duration leaves the cell empty
                  rather than breaking the one edge holding a long list together. */}
              <span className="text-right font-mono text-[10.5px] tabular-nums text-ink-subtle sm:text-[11px]">
                {trackDuration(track.lengthMs)}
              </span>
            </div>
          ))}
        </div>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={onExpand}
          className="mt-2 flex w-full items-center gap-1.75 border-t border-ink/7 pt-3 text-left font-semibold text-[12.5px] text-accent hover:text-accent-hover"
        >
          <ChevronDown className="size-3.5 flex-none" strokeWidth={2} aria-hidden />
          <span className="sm:hidden">{t("tracklist.showRemainingShort", { count: hidden })}</span>
          <span className="max-sm:hidden">{t("tracklist.showRemaining", { count: hidden })}</span>
        </button>
      )}
    </div>
  );
}

/**
 * The wait, at the height the answer will need (26e).
 *
 * Sized from the count the sheet already had, so the footer below the section does not jump
 * when the titles land a second later — which they routinely do, at one upstream request
 * per second shared by the whole app.
 */
export function Skeleton({ rows }: { readonly rows: number }) {
  const { t } = useTranslation();
  // Varied widths, because eight identical bars read as a table and not as titles.
  const widths = ["62%", "48%", "78%", "55%", "70%", "42%", "66%", "58%"];
  const bars = Array.from({ length: Math.max(rows, 3) }, (_, index) => ({
    key: `row-${index}`,
    width: widths[index % widths.length],
  }));
  return (
    <div className="mt-3" aria-busy aria-label={t("tracklist.loading")}>
      {bars.map((bar) => (
        <div key={bar.key} className={`${ROW} items-center border-t border-ink/7 py-2`}>
          <span className="h-2 w-4.5 animate-pulse rounded-sm bg-ink/8" />
          <span className="h-2 animate-pulse rounded-sm bg-ink/8" style={{ width: bar.width }} />
          <span className="h-2 w-6.5 animate-pulse justify-self-end rounded-sm bg-ink/8" />
        </div>
      ))}
    </div>
  );
}

/**
 * A tracklist that does not exist and never will (26e).
 *
 * Dashed, which is the deck's mark for a fact that is absent rather than empty, and without
 * a button — none of these three is a thing retrying can change.
 */
export function Absent({ tracklist }: { readonly tracklist: TracklistData | undefined }) {
  const { t } = useTranslation();
  const key =
    tracklist?.absence === "HAND_ENTERED"
      ? "tracklist.absent.handEntered"
      : tracklist?.absence === "DISCOGS"
        ? "tracklist.absent.discogs"
        : "tracklist.absent.notInCatalogue";
  return (
    <div className="mt-3 rounded-[10px] border border-dashed border-ink/18 p-3.5 sm:p-4">
      <p className="text-[12.5px] leading-[1.5] font-medium text-ink-muted sm:text-[13px]">
        {t(key)}
      </p>
    </div>
  );
}

/** The one tracklist state worth touching: solid edge, the accent, and a retry (26e). */
export function Unreachable({
  shared,
  onRetry,
}: {
  readonly shared: boolean;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 flex items-start gap-3 rounded-[10px] border border-accent/35 bg-accent/5 p-3.5 sm:p-4">
      <CloudOff className="mt-0.5 size-4 flex-none text-accent" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] leading-[1.5] font-medium text-ink/72 sm:text-[13px]">
          {shared ? t("tracklist.unreachableShared") : t("tracklist.unreachable")}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2.5 font-semibold text-[12.5px] text-accent hover:text-accent-hover"
        >
          {t("tracklist.retry")}
        </button>
      </div>
    </div>
  );
}

/**
 * The way to the tracklist's own page, in the space its rows would have taken (25e).
 *
 * Own page, own URL, so a tracklist survives being shared or bookmarked. The count is on
 * the row because it is the reason the row exists: "twenty-six tracks" is what makes going
 * somewhere else to read them an obviously fair trade rather than an extra tap.
 */
function PhonePageLink({
  copyId,
  tracks,
}: { readonly copyId: string; readonly tracks: number | null }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/copies/$copyId/tracks"
      params={{ copyId }}
      className="mt-2.5 flex min-h-11 items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-2.5 sm:hidden"
    >
      <span className="min-w-0 flex-1 text-[12.5px] font-semibold">{t("tracklist.openPage")}</span>
      {tracks !== null && (
        <span className="flex-none font-mono text-[11px] text-ink-subtle">
          {t("tracklist.tracks", { count: tracks })}
        </span>
      )}
      <ChevronRight
        size={15}
        strokeWidth={1.75}
        className="flex-none text-ink-subtle"
        aria-hidden
      />
    </Link>
  );
}
