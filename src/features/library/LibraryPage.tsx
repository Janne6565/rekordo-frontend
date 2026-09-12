import { ReleaseArt } from "@/components/ReleaseArt";
import { TileRating } from "@/components/TileRating";
import { AppShell } from "@/components/layout/AppShell";
import { Button, Skeleton } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useCarry } from "@/components/useCarry";
import { AddDialog } from "@/features/add/AddDialog";
import { ConfirmStrip } from "@/features/auth/ConfirmStrip";
import { SyncOutcomeStrip } from "@/features/auth/SyncOutcomeStrip";
import { CopyDetailsDialog } from "@/features/copy/CopyDetailsDialog";
import { useUndo } from "@/features/detail/UndoDelete";
import {
  type FormatFilter,
  type LibraryRow,
  type SortKey,
  useLibraryLogic,
} from "@/features/library/useLibraryLogic";
import { useCoverPhotos } from "@/features/photos/useCoverPhotos";
import { RollDialog } from "@/features/roll/RollDialog";
import { useMark, useSettle } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Format } from "@janne6565/rekordo-shared";
import { catalogArtShown, copyFormat, copyPreviewSrc } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { Link } from "@tanstack/react-router";
import { ArrowDownNarrowWide, Check, Dices, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const FILTERS: readonly FormatFilter[] = ["ALL", "VINYL", "CD", "CASSETTE", "DIGITAL"];

/**
 * A grid page's worth of placeholders, in the widths the deck draws them.
 *
 * Enough to fill the fold at the widths the grid actually lands on, and no more: the
 * point is that the page has its shape before the data arrives, not that the count is
 * guessed right.
 */
const SKELETON_CARDS: readonly (readonly [string, string])[] = [
  ["78%", "56%"],
  ["62%", "44%"],
  ["88%", "62%"],
  ["54%", "38%"],
  ["72%", "50%"],
  ["84%", "46%"],
  ["58%", "60%"],
  ["76%", "40%"],
  ["66%", "54%"],
  ["90%", "48%"],
  ["60%", "36%"],
  ["80%", "58%"],
];

/** Shared so the skeleton grid cannot drift away from the real one. */
const GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-3.5 " +
  // 24b: two columns at 390px puts the cover at 171px, and there they should fill the
  // width — a centred block on a phone is just two thin margins.
  //
  // Above 640px the columns fill the row. A fixed 180px track was the rule until now, and
  // what it actually produced was dead space: at a 1134px shelf it fits five tiles and
  // leaves 170px of empty paper down the right, which reads as a shelf that stopped early
  // rather than a deliberate margin.
  //
  // So the track has a floor rather than a size. 160px is low enough that one or two more
  // records fit at most widths, and `1fr` spends whatever is left over on the tiles that
  // are there instead of banking it. Turn 24 wanted every sleeve the same size on every
  // screen; this keeps them between about 160 and 210px, which is a far narrower swing
  // than `minmax(180px,1fr)` would give and never leaves a gap at the end of the row.
  "sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-4 sm:gap-y-5";

export function LibraryPage() {
  const { t } = useTranslation();
  const logic = useLibraryLogic();
  /**
   * Which sheet is over the library, if any. Local state rather than a route: the library
   * underneath stays mounted and keeps its scroll position, which is the whole reason
   * screen 6a is a modal instead of the page it replaced.
   */
  const [adding, setAdding] = useState(false);
  /**
   * 27 — the roll, over the shelf rather than instead of it.
   *
   * Local state and not a route, for the same reason the add sheet is: the dialog carries
   * its own pool and the library keeps its filter, its search and its scroll underneath,
   * which is the whole reason the dice can live in the toolbar.
   */
  const [rolling, setRolling] = useState(false);
  /** The copy whose details step is open over the sheet, if any (screen 8d). */
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  /**
   * The record that was just added, and the ring saying where it went.
   *
   * No toast and no "added" banner: the grid is already re-sorted with the record in its
   * rightful place, and the ring answers the only question the reader has — which one is
   * it — in the place where the answer lives.
   */
  const mark = useMark();
  /**
   * A record taken back out of the bin rings the same way a new one does. From the grid's
   * point of view they are the same event: something is here now that was not a moment
   * ago, and the only question is which one.
   */
  const { restored } = useUndo();
  useEffect(() => {
    if (restored !== null) mark.mark(restored);
  }, [restored, mark.mark]);

  return (
    <AppShell stats={logic.stats}>
      <header className="hidden flex-none items-center gap-4 border-b border-line px-7 py-4 sm:flex">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3.5">
          <Search size={16} strokeWidth={1.75} className="flex-none text-ink-subtle" aria-hidden />
          <input
            type="search"
            value={logic.search}
            onChange={(event) => logic.handleSearch(event.target.value)}
            placeholder={t("library.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-subtle"
          />
        </label>
        <button
          type="button"
          onClick={logic.cycleSort}
          className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted"
        >
          <ArrowDownNarrowWide size={15} strokeWidth={1.75} aria-hidden />
          {t(`library.sort.${sortKey(logic.sort)}`)}
        </button>
        {/* Left of Add, which is where 27a puts it. Outlined rather than filled: the deck
            draws Roll as the dark button because its toolbar has no other, and two solid
            blocks side by side would make the shelf look like it had two front doors. */}
        <button
          type="button"
          onClick={() => setRolling(true)}
          disabled={logic.collectionEmpty}
          aria-label={t("roll.openLabel")}
          className={cn(
            "flex h-9 flex-none items-center gap-1.75 rounded-lg border border-line px-3.5",
            "text-[12.5px] font-semibold text-accent hover:bg-canvas disabled:opacity-50",
          )}
        >
          <Dices size={15} strokeWidth={1.75} aria-hidden />
          {t("roll.open")}
        </button>
        <Button onClick={() => setAdding(true)} className="h-9 rounded-lg px-4 text-[13px]">
          {t("library.addItem")}
        </Button>
      </header>

      <div className="hidden flex-none items-baseline justify-between px-7 pt-4 pb-1.5 sm:flex">
        <h1 className="font-serif text-[26px] leading-none">{t("library.title")}</h1>
        {logic.stats === undefined ? (
          logic.loading && (
            <output className="font-mono text-xs text-ink-subtle">{t("library.loading")}</output>
          )
        ) : (
          <span className="font-mono text-xs text-ink-subtle">
            {t("library.counts", {
              copies: logic.stats.copyCount,
              releases: logic.stats.releaseGroupCount,
            })}
          </span>
        )}
      </div>

      {/* 21b: under the title, where the deck puts it — once per device, then never
          again. Above the header it would have read as chrome rather than as a line
          about the collection you are looking at. */}
      <ConfirmStrip />
      <SyncOutcomeStrip logic={logic} />

      <div className="hidden flex-none gap-1.5 px-7 pb-3 sm:flex">
        {FILTERS.map((filter) => (
          <FilterChip
            key={filter}
            active={logic.format === filter}
            onClick={() => logic.handleFormat(filter)}
            label={filter === "ALL" ? t("format.all") : FORMAT_LABELS[filter as Format]}
            count={filter === "ALL" ? undefined : logic.stats?.byFormat[filter as Format]}
          />
        ))}
      </div>

      {/*
       * One scrolling pane, and on a phone the header travels inside it (24b): the title
       * pulls away as you scroll, the search row and the chips stay. A filter you cannot
       * see is a bug, which is why the chips are the part that sticks.
       *
       * No horizontal padding of its own under 640px — the sticky block has to reach both
       * edges or the grid shows through its gutters as it passes underneath.
       */}
      <div className="min-h-0 flex-1 overflow-auto pb-7 sm:px-7">
        {/* 27c draws Roll beside the title on a narrow screen — the row under it already
            holds search, sort and add, and a fourth control there is a row of icons. */}
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2.5 sm:hidden">
          <h1 className="font-serif text-2xl leading-none">{t("library.title")}</h1>
          <button
            type="button"
            onClick={() => setRolling(true)}
            disabled={logic.collectionEmpty}
            aria-label={t("roll.openLabel")}
            className={cn(
              "flex h-7.5 flex-none items-center gap-1.5 rounded-[7px] bg-ink px-3",
              "text-[11.5px] font-semibold text-paper disabled:opacity-40",
            )}
          >
            <Dices size={13} strokeWidth={1.75} aria-hidden />
            {t("roll.open")}
          </button>
        </div>
        <PhoneHeader logic={logic} onAdd={() => setAdding(true)} />
        <div className="px-4 sm:px-0">
          <LibraryBody {...logic} onAdd={() => setAdding(true)} marked={mark.marked} />
        </div>
      </div>

      {rolling && <RollDialog onClose={() => setRolling(false)} />}
      {adding && <AddDialog onClose={() => setAdding(false)} onAdded={setDetailsFor} />}
      {/*
       * Stacked over the add sheet rather than replacing it (screen 8d): both are native
       * modal dialogs, so the browser puts the details step on top, makes the sheet inert
       * and sends Escape to the right one. Leaving the sheet mounted is what makes the
       * step safe to open after *every* add — dismissing it lands you back on the results
       * you added from, with the query and the scroll position still there.
       */}
      {detailsFor !== null && (
        <CopyDetailsDialog
          copyId={detailsFor}
          onClose={() => {
            // The sheet is gone and the grid holds the answer, so this is the moment the
            // ring means something.
            const added = detailsFor;
            setDetailsFor(null);
            mark.mark(added);
          }}
          onBack={() => setDetailsFor(null)}
        />
      )}
    </AppShell>
  );
}

/**
 * The library's chrome under 640px — screen 24b.
 *
 * Three rows, all of which stay while the grid scrolls under them: search with the two
 * things you do to a shelf beside it, the format chips, and a line that says how much you
 * are looking at and in what order. That last line is doing real work — the sort control
 * is an icon here, so the counter is the only place the current order is written down.
 */
function PhoneHeader({
  logic,
  onAdd,
}: { readonly logic: ReturnType<typeof useLibraryLogic>; readonly onAdd: () => void }) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState(false);

  return (
    <div className="sticky top-0 z-10 bg-paper pb-2.5 sm:hidden">
      <div className="flex items-center gap-2 px-4 pb-2">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <Search size={17} strokeWidth={2} className="flex-none text-ink-subtle" aria-hidden />
          <input
            type="search"
            value={logic.search}
            onChange={(event) => logic.handleSearch(event.target.value)}
            placeholder={t("library.searchShort")}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-subtle"
          />
        </label>
        <button
          type="button"
          onClick={() => setSorting(true)}
          aria-label={t("library.sortedBy", { sort: t(`library.sort.${sortKey(logic.sort)}`) })}
          className="flex size-11 flex-none items-center justify-center rounded-xl border border-line bg-surface"
        >
          <ArrowDownNarrowWide size={18} strokeWidth={1.9} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onAdd}
          aria-label={t("library.addItem")}
          className="flex size-11 flex-none items-center justify-center rounded-xl bg-ink text-paper"
        >
          <Plus size={20} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {/*
       * Scrolls sideways rather than wrapping. Four formats fit at 390px in English and
       * do not in German ("Kassette"), and a chip row that becomes two rows moves the grid
       * down by 44px the first time somebody switches language.
       */}
      <div className="flex gap-1.75 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.filter((filter) => filter !== "ALL").map((filter) => {
          const format = filter as Format;
          const count = logic.stats?.byFormat[format];
          const active = logic.format === filter;
          return (
            <button
              key={filter}
              type="button"
              // The active chip clears itself. There is no "All" chip on a phone: it spent
              // a whole cell saying "no filter", which is what the row already looks like.
              onClick={() => logic.handleFormat(active ? "ALL" : filter)}
              className={cn(
                "flex h-[34px] flex-none items-center gap-1.5 rounded-full px-3.25 text-xs",
                active
                  ? "bg-ink font-semibold text-paper"
                  : "border border-line bg-surface font-medium text-ink/62",
                // Dimmed, not hidden and not disabled: it says this shelf has none of
                // these, and it still filters to the empty state if you insist.
                count === 0 && !active && "opacity-50",
              )}
            >
              {FORMAT_LABELS[format]}
              {active && <X size={13} strokeWidth={2.4} aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="px-4 font-mono text-[11px] tracking-[0.05em] text-ink-subtle uppercase">
        {logic.stats !== undefined &&
          `${t("you.copies", { count: logic.stats.copyCount })} · ${t(`library.sort.${sortKey(logic.sort)}`)}`}
      </div>

      {sorting && (
        <SortSheet
          sort={logic.sort}
          onPick={(next) => {
            logic.setSort(next);
            setSorting(false);
          }}
          onClose={() => setSorting(false)}
        />
      )}
    </div>
  );
}

/** 24k: sorting is a sheet on a phone, because an icon that cycles cannot say what it did. */
function SortSheet({
  sort,
  onPick,
  onClose,
}: {
  readonly sort: SortKey;
  readonly onPick: (next: SortKey) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const options: readonly SortKey[] = ["ADDED_DESC", "ARTIST_ASC", "YEAR_DESC"];

  return (
    <Modal onClose={onClose} labelledBy={titleId} width="360px" align="center" phoneSheet>
      <div className="p-4.5">
        <h2 id={titleId} className="font-serif text-lg leading-none">
          {t("library.sortTitle")}
        </h2>
        <div className="mt-3.5 overflow-hidden rounded-[10px] border border-line">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPick(option)}
              className={cn(
                "flex h-[50px] w-full items-center justify-between border-b border-line px-3.5",
                "text-sm font-medium last:border-b-0 hover:bg-canvas",
              )}
            >
              {t(`library.sort.${sortKey(option)}`)}
              {option === sort && <Check size={16} strokeWidth={2.2} className="text-accent" />}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function LibraryBody({
  loading,
  failed,
  rows,
  collectionEmpty,
  onAdd,
  marked,
  arrangeable,
  arrange,
}: Pick<
  ReturnType<typeof useLibraryLogic>,
  "loading" | "failed" | "rows" | "collectionEmpty" | "arrangeable" | "arrange"
> & {
  readonly onAdd: () => void;
  readonly marked: string | null;
}) {
  const { t } = useTranslation();

  if (loading) return <LibrarySkeleton />;
  if (failed) return <p className="pt-8 text-sm text-ink-muted">{t("add.failed")}</p>;
  // The only slow entrance in the app, and the only place that earns one: an empty screen
  // has no content to carry the eye. As one piece — never headline, then body, then button.
  if (collectionEmpty)
    return (
      <div className="mc-entrance">
        <EmptyLibrary onAdd={onAdd} />
      </div>
    );
  // The reader typed, so they are watching: a Cross, not an entrance.
  if (rows.length === 0)
    return <p className="mc-cross pt-8 text-sm text-ink-muted">{t("library.noMatches")}</p>;

  return <LibraryGrid rows={rows} marked={marked} arrangeable={arrangeable} arrange={arrange} />;
}

/**
 * Split out because the photo lookup is a hook, and the body above returns early for
 * loading, failure and both kinds of empty before there are ever any rows to look up.
 */
function LibraryGrid({
  rows,
  marked,
  arrangeable,
  arrange,
}: {
  readonly rows: readonly LibraryRow[];
  readonly marked: string | null;
  readonly arrangeable: boolean;
  readonly arrange: (from: number, to: number) => void;
}) {
  const covers = useCoverPhotos(useMemo(() => rows.map((row) => row.copy.id), [rows]));
  const grid = useRef<HTMLDivElement>(null);

  /**
   * Dragging *is* how a shelf becomes hand-arranged: there is no separate mode, and the
   * drop switches the order to "your order" because the order you were looking at when you
   * picked a record up is the order you meant to adjust.
   */
  const carry = useCarry({ count: rows.length, enabled: arrangeable, onDrop: arrange });

  /**
   * Settle. The order of the ids is what changes when a filter, a sort or the search term
   * does, so it is what the measure keys off — a tile whose neighbours moved has moved.
   */
  useSettle(
    grid,
    useMemo(() => rows.map((row) => row.copy.id).join(), [rows]),
  );

  return (
    <div ref={grid} className={GRID_CLASS}>
      {rows.map((row, index) => (
        <div key={row.copy.id} style={carry.styleFor(index)} {...carry.itemProps(index)}>
          <GridItem
            row={row}
            previewSrc={copyPreviewSrc(row.copy, covers.get(row.copy.id) ?? null)}
            allowCatalogArt={catalogArtShown(row.copy, true)}
            marked={marked === row.copy.id}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Screen 9c — the same shimmer as the add dialog, in the shape of a cover card.
 *
 * The grid class and every dimension below are the ones GridItem uses, so the covers drop
 * into the boxes the placeholders were already holding open and the page does not reflow
 * under a reader who has started scrolling it.
 */
function LibrarySkeleton() {
  return (
    <div className={GRID_CLASS}>
      {SKELETON_CARDS.map(([title, subtitle]) => (
        <div key={title + subtitle}>
          <Skeleton className="aspect-[6/5] rounded-sm" />
          <Skeleton className="mt-1.5 h-[11px] rounded-[3px]" style={{ width: title }} />
          <Skeleton tone="faint" className="mt-1.5 h-2 rounded-[3px]" style={{ width: subtitle }} />
        </div>
      ))}
    </div>
  );
}

function GridItem({
  row,
  previewSrc,
  allowCatalogArt,
  marked,
}: {
  readonly row: LibraryRow;
  readonly previewSrc: string | null;
  readonly allowCatalogArt: boolean;
  readonly marked: boolean;
}) {
  const { t } = useTranslation();
  const marker = useRef<HTMLElement | null>(null);

  /**
   * A record that landed below the fold is not findable by a ring nobody can see, so the
   * grid goes to it first and the ring starts on arrival.
   */
  useEffect(() => {
    if (!marked) return;
    marker.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [marked]);

  return (
    <Link
      ref={(element) => {
        marker.current = element;
      }}
      to="/copies/$copyId"
      params={{ copyId: row.copy.id }}
      // The route swap is a Cross. Where the browser has no view transitions this is
      // simply ignored and the swap is what it is today.
      viewTransition
      data-settle-key={row.copy.id}
      className={cn("group block", marked && "mc-mark")}
    >
      <div className="relative aspect-[6/5]">
        <ReleaseArt
          release={row.release}
          format={copyFormat(row.copy, row.release)}
          previewSrc={previewSrc}
          allowCatalogArt={allowCatalogArt}
        />
        {/* 24b puts the format on the artwork itself under 640px. On the desktop grid the
            sidebar's format list is right there; on a phone that list is a tab away. */}
        <span className="absolute bottom-1.75 left-1.75 font-mono text-[8px] tracking-[0.06em] text-ink-subtle uppercase sm:hidden">
          {FORMAT_LABELS[copyFormat(row.copy, row.release)]}
        </span>
      </div>
      {/*
       * Wraps under 640px instead of truncating. Two columns is 171px of cover, and
       * "Selected Ambient Works 85–92" truncated at that width is four words of a title
       * nobody can tell apart from the next one. Above it, the desktop keeps one line.
       */}
      <div className="mt-1.75 text-[13px] leading-tight font-semibold text-pretty group-hover:text-accent sm:mt-1.5 sm:truncate sm:text-[12.5px]">
        {row.release?.title ?? "—"}
      </div>
      <div className="truncate text-[12px] leading-tight text-ink-muted sm:text-[11.5px]">
        {row.release === undefined
          ? ""
          : `${row.release.artistName} · ${row.release.year ?? t("common.unknownYear")}`}
      </div>
      <TileRating rating={row.copy.rating} />
    </Link>
  );
}

function EmptyLibrary({ onAdd }: { readonly onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-3 pt-16">
      <h2 className="font-serif text-2xl">{t("library.empty.title")}</h2>
      <p className="max-w-sm text-sm text-ink-muted">{t("library.empty.body")}</p>
      <Button onClick={onAdd} className="mt-2">
        {t("library.empty.action")}
      </Button>
    </div>
  );
}

interface FilterChipProps {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly label: string;
  readonly count?: number;
}

function FilterChip({ active, onClick, label, count }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-none rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-(--mc-quick)",
        active
          ? "bg-ink font-semibold text-paper"
          : "border border-line bg-surface hover:bg-canvas",
      )}
    >
      {label}
      {count !== undefined && (
        // The active chip is ink-on-ink, so the count needs the inverse muted tone or it
        // vanishes into the pill rather than dimming inside it.
        <span className={cn("ml-1.5", active ? "text-paper/55" : "text-ink-subtle")}>{count}</span>
      )}
    </button>
  );
}

function sortKey(
  sort: ReturnType<typeof useLibraryLogic>["sort"],
): "addedDesc" | "artistAsc" | "yearDesc" | "manual" {
  return sort === "ADDED_DESC"
    ? "addedDesc"
    : sort === "ARTIST_ASC"
      ? "artistAsc"
      : sort === "MANUAL"
        ? "manual"
        : "yearDesc";
}
