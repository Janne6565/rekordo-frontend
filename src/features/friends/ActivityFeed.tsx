import type { ActivityEntryDto } from "@/api/generated/rekordoAPI.schemas";
import { ReleaseArt } from "@/components/ReleaseArt";
import { Skeleton } from "@/components/ui";
import { formatRelativeTime } from "@/domain/relativeTime";
import { Avatar } from "@/features/friends/Avatar";
import { FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";

/**
 * The activity half of 15a and 15g.
 *
 * Grouped under day headings rather than shown as one undifferentiated stream: a feed of a
 * dozen records is read as "what happened yesterday", not as a timeline.
 */
export function ActivityFeed({
  entries,
  loading,
}: { readonly entries: readonly ActivityEntryDto[]; readonly loading: boolean }) {
  const { t, i18n } = useTranslation();

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
        <p className="text-[13px] font-medium text-ink">{t("friends.feedEmpty.title")}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          {t("friends.feedEmpty.body")}
        </p>
      </div>
    );
  }

  const days = groupByDay(entries, i18n.language);
  return (
    <div className="flex flex-col gap-5">
      {days.map(([label, rows]) => (
        <section key={label}>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
            {label}
          </h2>
          <div className="flex flex-col gap-2">
            {rows.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Entry({ entry }: { readonly entry: ActivityEntryDto }) {
  const { t, i18n } = useTranslation();
  const name = entry.actor?.displayName ?? entry.actor?.handle ?? "";
  const count = entry.copyCount ?? 1;
  const handle = entry.actor?.handle ?? "";

  const body = (
    <>
      <Avatar name={name} src={entry.actor?.avatarUrl} size={26} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-ink">
          <Sentence entry={entry} name={name} count={count} />
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-muted">
          {[
            entry.artistName,
            entry.format ? FORMAT_LABELS[entry.format] : undefined,
            entry.year?.toString(),
            entry.occurredAt
              ? formatRelativeTime(new Date(entry.occurredAt).getTime(), i18n.language)
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {/*
         * What the row does, written out. The feed carries a few sleeves from a collapsed
         * line and no copy ids, so there is nothing to open that is exactly these eight —
         * but the destination below is their shelf, sorted newest first, which puts them at
         * the top of it. Plain text, not a link of its own: the whole row is the link now.
         */}
        {handle !== "" && (
          <span className="mt-1 inline-block text-[11.5px] font-medium text-accent">
            {count > 1
              ? t("friends.seeAll", { count })
              : t(`friends.action.${destinationOf(entry)}`)}
          </span>
        )}
      </div>
      {/*
       * The sleeve closes the line rather than opening it: the row reads as a sentence
       * about a person, and the record it is about belongs at its end.
       *
       * Only where there is one. An accepted friendship is about nobody's record: the
       * server sends it with no title, no format and no cover, so what used to sit here was
       * a format silhouette standing in for a record that does not exist.
       */}
      {isAboutARecord(entry) &&
        (count > 1 && (entry.collapsedCovers ?? []).length > 0 ? (
          <CoverStack covers={entry.collapsedCovers ?? []} />
        ) : (
          // A burst whose sleeves all 404 has no stack to fan, and an empty grey rectangle
          // is the same nothing this row just stopped drawing. The head's own tile, which
          // falls back to the format silhouette, says more.
          <Cover url={entry.coverArtUrl} format={entry.format} />
        ))}
    </>
  );

  const shell =
    "flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 no-underline";

  /*
   * An entry whose actor never claimed a handle has nowhere to go — there is no page for a
   * person without one. It stays a plain row rather than becoming a link that lands on a
   * 404, which is the one thing worse than a row that does nothing.
   */
  if (handle === "") return <div className={shell}>{body}</div>;

  const destination = destinationOf(entry);
  return (
    <Link
      to={destination === "wishlist" ? "/friends/$handle/wishlist" : "/friends/$handle"}
      params={{ handle }}
      className={`${shell} transition-colors hover:border-ink-subtle hover:bg-canvas`}
    >
      {body}
    </Link>
  );
}

/**
 * Whether the line has a record in it at all.
 *
 * `FRIENDSHIP_ACCEPTED` is the one type the server stores with no release attached; the
 * title check is there for the same line arriving hollow for any other reason, since a
 * sleeve for a record with no name is the same empty box either way.
 */
function isAboutARecord(entry: ActivityEntryDto): boolean {
  return entry.type !== "FRIENDSHIP_ACCEPTED" && (entry.title ?? "") !== "";
}

/**
 * Where a line takes you.
 *
 * A wish that was *added* is on their wishlist; a wish that was *fulfilled* has moved off
 * it onto the shelf, so it sends you where the record now is rather than where it was.
 * Everything else — a copy added, a friendship accepted — is the shelf or the person, and
 * both live at the profile.
 */
function destinationOf(entry: ActivityEntryDto): "wishlist" | "shelf" | "profile" {
  if ((entry.copyCount ?? 1) > 1) return "shelf";
  if (entry.type === "WISH_ADDED") return "wishlist";
  if (entry.type === "FRIENDSHIP_ACCEPTED") return "profile";
  return "shelf";
}

/**
 * The line itself. Written with Trans rather than assembled from fragments so that German
 * can put the name, the verb and the title in German order.
 */
function Sentence({
  entry,
  name,
  count,
}: { readonly entry: ActivityEntryDto; readonly name: string; readonly count: number }) {
  /*
   * Plain text, not a link: the whole row is one link now, and an anchor nested inside an
   * anchor is invalid markup that browsers resolve by dropping one of them.
   */
  const person = <span className="font-semibold text-ink">{name}</span>;
  const title = <span className="font-semibold text-ink">{entry.title}</span>;

  if (count > 1) {
    return (
      <Trans
        i18nKey="friends.line.addedMany"
        values={{ name, count }}
        components={{ person, title: <span /> }}
      />
    );
  }
  switch (entry.type) {
    case "WISH_ADDED":
      return (
        <Trans
          i18nKey="friends.line.wishAdded"
          values={{ name, title: entry.title }}
          components={{ person, title }}
        />
      );
    case "WISH_FULFILLED":
      return (
        <Trans
          i18nKey="friends.line.wishFulfilled"
          values={{ name, title: entry.title }}
          components={{ person, title }}
        />
      );
    case "FRIENDSHIP_ACCEPTED":
      /*
       * The one line both people in it can read, and the server draws the *other* one on
       * it either way — so the sentence, not the name, is what changes sides.
       */
      return (
        <Trans
          i18nKey={entry.byViewer ? "friends.line.acceptedByYou" : "friends.line.accepted"}
          values={{ name }}
          components={{ person, title: <span /> }}
        />
      );
    default:
      return (
        <Trans
          i18nKey="friends.line.added"
          values={{ name, title: entry.title }}
          components={{ person, title }}
        />
      );
  }
}

function Cover({
  url,
  format,
}: { readonly url: string | undefined; readonly format: ActivityEntryDto["format"] }) {
  return (
    // Never a bare img: four covers in ten are a 404 at the archive, so this falls back to
    // the format silhouette the same way every other tile in the app does.
    <ReleaseArt
      release={{ coverArtUrl: url ?? null, format }}
      className="h-10 w-12 flex-none"
      loading="lazy"
    />
  );
}

/** The little fan of sleeves beside a collapsed burst. */
function CoverStack({ covers }: { readonly covers: readonly string[] }) {
  return (
    <div className="flex h-10 w-12 flex-none">
      {covers.slice(0, 3).map((url, index) => (
        <div
          key={url}
          className="h-10 w-12 overflow-hidden rounded-md border border-surface bg-line"
          style={{ marginLeft: index === 0 ? 0 : -34, zIndex: 3 - index }}
        >
          <ReleaseArt release={{ coverArtUrl: url }} className="h-full w-full" loading="lazy" />
        </div>
      ))}
    </div>
  );
}

/**
 * Day buckets, from the viewer's own clock.
 *
 * Deliberately not computed on the server: "today" depends on where the person reading is,
 * and a feed served from UTC would put a European's evening into tomorrow.
 */
function groupByDay(
  entries: readonly ActivityEntryDto[],
  language: string,
): [string, ActivityEntryDto[]][] {
  const days = new Map<string, ActivityEntryDto[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();

  for (const entry of entries) {
    const when = entry.occurredAt ? new Date(entry.occurredAt) : new Date();
    const stamp = when.toDateString();
    const label =
      stamp === today
        ? labelFor("today", language)
        : stamp === yesterday
          ? labelFor("yesterday", language)
          : when.toLocaleDateString(language, { day: "numeric", month: "long" });
    days.set(label, [...(days.get(label) ?? []), entry]);
  }
  return [...days.entries()];
}

function labelFor(which: "today" | "yesterday", language: string): string {
  const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const parts = relative.formatToParts(which === "today" ? 0 : -1, "day");
  const literal = parts.map((part) => part.value).join("");
  return literal.charAt(0).toUpperCase() + literal.slice(1);
}
