import { ReleaseArt } from "@/components/ReleaseArt";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui";
import { useCarry } from "@/components/useCarry";
import { formatRelativeTime } from "@/domain/relativeTime";
import { AddDialog } from "@/features/add/AddDialog";
import { CopyDetailsDialog } from "@/features/copy/CopyDetailsDialog";
import { useCollectionStats } from "@/features/library/useLibraryLogic";
import { WishDetailsDialog } from "@/features/wishlist/WishDetailsDialog";
import { WishDialog } from "@/features/wishlist/WishDialog";
import { useWishlistLogic } from "@/features/wishlist/useWishlistLogic";
import { cn } from "@/lib/utils";
import type { WishlistItem } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { useNavigate } from "@tanstack/react-router";
import { Check, Disc3, GripVertical, Heart, Pencil, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Screen 16g — the wishlist as rows rather than a grid.
 *
 * The deck's reasoning, kept because it is the whole layout decision: the note is worth
 * more than a bigger sleeve. Someone reads this list to remember *why* a record is on it,
 * and a wall of thumbnails cannot carry "original Spoon press, green label, no barcode".
 */
export function WishlistPage() {
  const { t, i18n } = useTranslation();
  const logic = useWishlistLogic();
  const stats = useCollectionStats();

  /** The sheet: `true` for a new entry, an item to edit it, null when closed. */
  const [sheet, setSheet] = useState<true | WishlistItem | null>(null);
  /**
   * The entry being hunted down (screen 16d).
   *
   * The add flow opens with the wish's search already run — a wish names an album, not a
   * pressing, so which copy you found is still yours to pick. The entry stays put while
   * you do: it only leaves once a copy exists, which `useSatisfyWishes` sees and undoes.
   */
  const [hunting, setHunting] = useState<WishlistItem | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  /** The entry being read (16j). The list stays behind it — it is the workspace. */
  const [reading, setReading] = useState<string | null>(null);
  const navigate = useNavigate();
  /**
   * A drag reorders the *whole* list, and an index into a narrowed one points at the wrong
   * entry — so a filtered list is read rather than arranged.
   */
  const carry = useCarry({
    count: logic.items.length,
    enabled: !logic.filtering,
    onDrop: logic.reorder,
  });

  return (
    <AppShell stats={stats}>
      <header className="flex flex-none items-start justify-between gap-4 px-4 pt-5 pb-3.5 sm:px-7 sm:pt-6 sm:pb-4">
        <div>
          <h1 className="font-serif text-2xl leading-none sm:text-[26px]">{t("nav.wishlist")}</h1>
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            {t("wishlist.count", { count: logic.count })}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2.5">
          {/* The word does not fit at 390px, and the icon is the same one the library's
              header uses for the same act. */}
          <Button
            onClick={() => setSheet(true)}
            aria-label={t("wishlist.addToWishlist")}
            className="size-11 rounded-xl p-0 sm:h-9 sm:w-auto sm:rounded-lg sm:px-4 sm:text-[13px]"
          >
            <Plus size={15} strokeWidth={2} aria-hidden />
            <span className="max-sm:hidden">{t("wishlist.addToWishlist")}</span>
          </Button>
        </div>
      </header>

      {/* Only once there is a list to narrow: a box over an empty screen is a box that
          can only ever return nothing. */}
      {logic.count > 0 && (
        <div className="flex-none px-4 pb-3 sm:px-7">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 sm:h-9">
            <Search
              size={16}
              strokeWidth={1.75}
              className="flex-none text-ink-subtle"
              aria-hidden
            />
            <input
              type="search"
              value={logic.search}
              onChange={(event) => logic.handleSearch(event.target.value)}
              placeholder={t("wishlist.filterPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-subtle"
            />
          </label>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-8 sm:px-7">
        {logic.loading ? null : logic.count === 0 ? (
          <EmptyWishlist onAdd={() => setSheet(true)} />
        ) : logic.noMatches ? (
          <p className="mc-cross pt-8 text-sm text-ink-muted">{t("wishlist.filterNoMatches")}</p>
        ) : (
          <>
            {/* 24d: no column heads under 640px — there are no columns left to head. */}
            <div
              className="hidden items-center gap-x-3 border-b border-line pb-2 font-mono text-[10px] tracking-[0.12em] text-ink-subtle uppercase sm:grid"
              style={{ gridTemplateColumns: GRID }}
            >
              <span />
              <span />
              <span>{t("wishlist.column.release")}</span>
              <span>{t("wishlist.column.format")}</span>
              <span>{t("wishlist.column.note")}</span>
              <span>{t("wishlist.column.added")}</span>
              <span />
            </div>

            {logic.items.map((item, index) => (
              <Row
                key={item.id}
                item={item}
                coverArtUrl={logic.coverOf(item)}
                pictureSrc={logic.pictureOf(item)}
                carried={carry.carrying === index}
                arrangeable={!logic.filtering}
                style={carry.styleFor(index)}
                carryProps={carry.itemProps(index)}
                onOpen={() => setReading(item.id)}
                onFound={() => setHunting(item)}
                language={i18n.language}
              />
            ))}

            <p className="hidden pt-4 text-[11.5px] text-ink-muted sm:block">
              {logic.filtering ? t("wishlist.dragWhileFiltered") : t("wishlist.dragHint")}
            </p>
          </>
        )}
      </div>

      {reading !== null && (
        <WishDetailsDialog
          wishId={reading}
          onClose={() => setReading(null)}
          onFound={() => {
            const item = logic.items.find((entry) => entry.id === reading);
            setReading(null);
            if (item !== undefined) setHunting(item);
          }}
          onSeeCopy={(copyId) => {
            setReading(null);
            void navigate({ to: "/copies/$copyId", params: { copyId } });
          }}
        />
      )}

      {sheet !== null && (
        <WishDialog onClose={() => setSheet(null)} entry={sheet === true ? null : sheet} />
      )}

      {hunting !== null && (
        <AddDialog
          onClose={() => setHunting(null)}
          onAdded={setDetailsFor}
          seedTerm={`${hunting.artistName} ${hunting.title}`.trim()}
          hunting={hunting}
        />
      )}

      {detailsFor !== null && (
        <CopyDetailsDialog
          copyId={detailsFor}
          onClose={() => {
            setDetailsFor(null);
            setHunting(null);
          }}
        />
      )}
    </AppShell>
  );
}

/**
 * handle · art · release · format · note · added · found it.
 *
 * Turn 18 draws 16g with no actions at all, on the grounds that the row opens an entry
 * holding all three verbs. One is kept anyway: "I found a copy" is the reason the list
 * exists, and making the common ending of a hunt cost an extra click to reach is the wrong
 * trade. Editing and removing did go — both are one click away in the entry, and 16c is
 * the add sheet now.
 *
 * 112px is the widest label the button carries, the German "Gefunden" at 103px rather than
 * the width English happens to need; squeezed to fit, it folded onto two lines.
 */
/**
 * The artwork track is 56px for a 53px box, not 44px.
 *
 * A format mark is a 6:5 composition — the sleeve, and the object leaning out from behind it
 * on the right (turn 25). At 44px the box overran its own column by nine pixels and ate the
 * gap, so the title sat almost against the edge of the vinyl. The track is now wider than
 * the box, which is what makes the column gap the space you actually see.
 */
const GRID = "18px 56px minmax(0,1.5fr) 84px minmax(0,2fr) 96px 112px";

interface RowProps {
  readonly item: WishlistItem;
  /** The album's artwork, or null while it is on its way and when there is none. */
  readonly coverArtUrl: string | null;
  /** The picture uploaded for this entry, for a record no catalogue has. */
  readonly pictureSrc: string | null;
  /** True for the row in the air. */
  readonly carried: boolean;
  /** False while a search term narrows the list, which is when a drag cannot be trusted. */
  readonly arrangeable: boolean;
  /** Where the carry wants this row drawn: its own offset, or a neighbour's shift. */
  readonly style: React.CSSProperties;
  readonly carryProps: ReturnType<ReturnType<typeof useCarry>["itemProps"]>;
  /** Opens the entry (16j). The whole row, because everything on it is about one entry. */
  readonly onOpen: () => void;
  /** The hunt's ending, kept on the row: it is what the list is for. */
  readonly onFound: () => void;
  readonly language: string;
}

function Row({
  item,
  coverArtUrl,
  pictureSrc,
  carried,
  arrangeable,
  style,
  carryProps,
  onOpen,
  onFound,
  language,
}: RowProps) {
  const { t } = useTranslation();

  return (
    // The row opens the entry and is also what you pick up — there is no handle any more,
    // because nothing is swallowing the press: a carry only starts once the pointer has
    // moved, so a click is still a click and reading the list is unaffected.
    // biome-ignore lint/a11y/useSemanticElements: a button cannot hold a row of controls
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      {...carryProps}
      style={{ gridTemplateColumns: GRID, ...style }}
      className={cn(
        // A flex row of 72px under 640px, the table above it (24d). The inline grid
        // template below is inert while this is a flex container.
        "group flex min-h-[72px] cursor-pointer items-center gap-3 rounded-lg border-b border-line px-1 py-2.5",
        "sm:grid sm:min-h-0 sm:gap-x-3 sm:px-2",
        "transition-[box-shadow,background-color]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink",
        // A carried row is lifted off the page rather than faded out of it: it is the
        // thing being moved, so it should be the thing you can see.
        carried ? "bg-paper shadow-[0_14px_26px_rgb(25_23_19/0.22)]" : "hover:bg-canvas/60",
      )}
    >
      {/* The grip is a cue now, not a control: the row is picked up from anywhere on it,
          and a mark that says so is worth more than a target that is the only way in. */}
      <span
        aria-hidden
        className={cn(
          "hidden text-ink-subtle opacity-0 transition-opacity sm:block",
          arrangeable && "group-hover:opacity-100",
          carried && "opacity-100",
        )}
      >
        <GripVertical size={15} strokeWidth={1.75} />
      </span>

      <div className="h-12 w-[58px] flex-none sm:h-11 sm:w-[53px]">
        {/* The wanted format is the silhouette, not the artwork: an entry for the vinyl of
            a record you already have on CD should look like the thing you are hunting. */}
        <ReleaseArt
          release={{ coverArtUrl }}
          previewSrc={pictureSrc}
          format={item.desiredFormat ?? "OTHER"}
          loading="lazy"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] leading-tight font-semibold">{item.title}</div>
        {/*
         * 24k's identity line: what it is above, what tells it apart below, joined with
         * " · " and missing parts left out silently. The format is part of it under 640px
         * because the column that carried it is gone.
         */}
        <div className="truncate text-[11.5px] leading-snug text-ink-muted">
          {[
            item.artistName,
            item.year === null ? null : String(item.year),
            item.desiredFormat === null
              ? t("wishlist.anyFormat")
              : FORMAT_LABELS[item.desiredFormat],
          ]
            .filter((part): part is string => part !== null)
            .join(" · ")}
        </div>
        <div className="truncate text-[11.5px] leading-snug text-ink-muted sm:hidden">
          {item.note}
        </div>
      </div>

      <span className="hidden font-mono text-[10px] tracking-[0.06em] text-ink-muted uppercase sm:inline">
        {item.desiredFormat === null ? t("wishlist.anyFormat") : FORMAT_LABELS[item.desiredFormat]}
      </span>

      <span className="hidden truncate text-[12px] text-ink-muted sm:inline">
        {item.note ?? "—"}
      </span>

      {/* "Added" is the column 24d drops: it is in the entry's own sheet, and it is never
          the reason somebody opens this list in a shop. */}
      <span className="hidden font-mono text-[10px] text-ink-subtle sm:inline">
        {formatRelativeTime(item.createdAt, language)}
      </span>

      {/* Quiet until the row is under the pointer: a column that shouts on every row is one
          you read past. Never folds — a label on two lines pushed the row out of line. */}
      {/*
       * Always visible under 640px. It was a hover affordance, and hover is the one thing
       * a phone does not have — this is also the reason the list gets opened in a shop at
       * all, so it cannot be the thing that is hidden.
       */}
      <div className="flex flex-none justify-end opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <Button
          onClick={(event) => {
            // The row opens the entry; this button does its own thing instead.
            event.stopPropagation();
            onFound();
          }}
          className="h-11 flex-none rounded-lg px-3 text-[12px] whitespace-nowrap sm:h-8"
        >
          <Check size={14} strokeWidth={2} aria-hidden />
          {t("wishlist.foundIt")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Screen 16f — the list before anything is on it.
 *
 * It says where entries come from rather than offering one button, because the wishlist is
 * not somewhere you go to add things: it is where records you found somewhere else end up.
 */
function EmptyWishlist({ onAdd }: { readonly onAdd: () => void }) {
  const { t } = useTranslation();

  const ways = [
    { key: "search", icon: Search, action: onAdd },
    { key: "artist", icon: Disc3, action: onAdd },
    { key: "friend", icon: Users, action: null },
    { key: "manual", icon: Pencil, action: onAdd },
  ] as const;

  return (
    <div className="mx-auto max-w-md pt-14 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-canvas">
        <Heart size={22} strokeWidth={1.5} className="text-ink-subtle" aria-hidden />
      </div>
      <h2 className="pt-5 font-serif text-xl">{t("wishlist.emptyTitle")}</h2>
      <p className="pt-2 text-[12.5px] leading-relaxed text-ink-muted">{t("wishlist.emptyLede")}</p>

      <div className="pt-6 text-left">
        {ways.map(({ key, icon: Icon, action }) => (
          <button
            key={key}
            type="button"
            onClick={action ?? undefined}
            disabled={action === null}
            className="flex w-full items-center gap-3 border-b border-line py-3 text-left disabled:opacity-45"
          >
            <Icon size={16} strokeWidth={1.75} className="flex-none text-ink-subtle" aria-hidden />
            <span className="flex-1 text-[12.5px]">{t(`wishlist.way.${key}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
