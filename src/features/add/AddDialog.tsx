import { releaseDisambiguation } from "@/api/releases";
import { AlbumArt } from "@/components/AlbumArt";
import { ReleaseArt } from "@/components/ReleaseArt";
import { Button, FieldSpinner, Modal, ModalClose, PulsingDots, Skeleton } from "@/components/ui";
import { ArtistPane } from "@/features/add/ArtistPane";
import { ArtistResults } from "@/features/add/ArtistResults";
import { ManualTab } from "@/features/add/ManualTab";
import { PressingStep } from "@/features/add/PressingStep";
import { type AddTab, useAddDialogLogic } from "@/features/add/useAddDialogLogic";
import { useArtistSearchLogic } from "@/features/add/useArtistSearchLogic";
import { ScanHandoffSheet } from "@/features/app/ScanHandoffSheet";
import { appStoreUrl, mobilePlatform } from "@/lib/appStores";
import { cn } from "@/lib/utils";
import type { Album, RecordGroup, Release, WishlistItem } from "@janne6565/rekordo-shared";
import { CONDITION_SHORT, FORMAT_LABELS, editionLabel } from "@janne6565/rekordo-shared";
import {
  ArrowUpLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CopyPlus,
  FileUp,
  Heart,
  LibraryBig,
  Pencil,
  ScanBarcode,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// In the deck's order (14b): the two lookups, then the way in for what they cannot find.
const TABS: readonly AddTab[] = ["SEARCH", "BARCODE", "MANUAL", "CSV"];

/**
 * Four placeholder rows, in the widths the deck draws them.
 *
 * Four rather than "as many as fit": it fills the visible list without promising a result
 * count nobody knows yet. The uneven widths are what stop the block reading as a table.
 */
const SKELETON_ROWS: readonly (readonly [string, string, string])[] = [
  ["62%", "44%", "30%"],
  ["48%", "56%", "24%"],
  ["70%", "38%", "34%"],
  ["54%", "48%", "28%"],
];

interface AddDialogProps {
  readonly onClose: () => void;
  /** Opens the details step (screen 8d) over the sheet for the copy just created. */
  readonly onAdded: (copyId: string) => void;
  /** A search to open with — the wishlist's "I found a copy" arrives with one (16d). */
  readonly seedTerm?: string;
  /** The entry being hunted down, for the reminder above the results (16d). */
  readonly hunting?: WishlistItem | null;
}

/** Screen 6a — the add sheet over a dimmed library. */
export function AddDialog({ onClose, onAdded, seedTerm = "", hunting = null }: AddDialogProps) {
  const { t } = useTranslation();
  const logic = useAddDialogLogic(onClose, seedTerm);
  const titleId = useId();

  // The pressing step replaces the sheet's contents rather than opening a second dialog:
  // it is a mode of this one, and its own back link is how you leave it.
  if (logic.step !== null) {
    return (
      <Modal onClose={onClose} labelledBy={titleId} width="660px" phoneSheet sheetHeight="full">
        <h2 id={titleId} className="sr-only">
          {t("addDialog.title")}
        </h2>
        <PressingStep logic={logic} />
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} width="660px" phoneSheet sheetHeight="full">
      {/* An open discography replaces the whole header: screen 10d puts "Back to results"
          and the close button on one row, and the sheet's own title is not the artist's.
          The heading stays rendered for the dialog's accessible name — sr-only rather
          than removed, because aria-labelledby cannot point at something that is gone. */}
      {logic.openArtist !== null ? (
        <h2 id={titleId} className="sr-only">
          {t("addDialog.title")}
        </h2>
      ) : (
        <div className="flex flex-none items-start justify-between gap-4 px-4 pt-5 sm:px-6 sm:pt-5.5">
          <div>
            <h2 id={titleId} className="font-serif text-2xl leading-[1.1]">
              {t("addDialog.title")}
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              {logic.tab === "MANUAL" ? t("manual.lede") : t("addDialog.lede2")}
            </p>
          </div>
          <ModalClose onClose={onClose} label={t("common.close")} />
        </div>
      )}

      {/* The tab strip goes away with the search: an open discography is not a fifth tab,
          and leaving them live would strand you on "Barcode" with an artist still open. */}
      <div
        className={cn(
          "flex flex-none gap-5 overflow-x-auto border-b border-line px-4 pt-4 sm:px-6 sm:pt-5",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          logic.openArtist !== null && "hidden",
        )}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => logic.setTab(tab)}
            aria-current={logic.tab === tab}
            className={cn(
              "pb-2.5 text-[12.5px] whitespace-nowrap",
              logic.tab === tab
                ? "border-b-2 border-ink font-semibold"
                : "font-medium text-ink-muted hover:text-ink",
            )}
          >
            {t(`addDialog.tab.${tab}`)}
          </button>
        ))}
      </div>

      {logic.tab === "MANUAL" ? (
        <ManualTab onClose={onClose} onAdded={onAdded} />
      ) : logic.tab === "CSV" ? (
        <CsvTab logic={logic} />
      ) : logic.openArtist !== null ? (
        <>
          <ArtistPane
            artist={logic.openArtist}
            fromQuery={logic.submittedTerm}
            onBack={logic.closeArtist}
            onClose={onClose}
            onAdd={logic.addRelease}
            onWish={logic.addWish}
            wishingMbid={logic.wishingMbid}
            addingMbid={logic.addingMbid}
            isOwned={logic.isOwned}
            selected={logic.selected}
            onSelect={logic.select}
          />
          {/* The sheet keeps its footer inside the discography (10d): the way out of the
              modal should not depend on which pane of it you happen to be looking at. */}
          <SheetFooter logic={logic} />
        </>
      ) : (
        <SearchTab logic={logic} hunting={hunting} />
      )}
    </Modal>
  );
}

type Logic = ReturnType<typeof useAddDialogLogic>;

/**
 * The camera path, named rather than hidden — screen 25c.
 *
 * The web app has no scanner, so the row that would open one says so and keeps its place
 * at the bottom of what this tab offers, under the field that does work. Hiding it would
 * leave a reader who came here to scan wondering whether they had missed a button; a
 * degraded web scanner would be worse still, because the native flow keeps a tray across
 * many scans, survives the tab being backgrounded, and works with no signal at all.
 *
 * Dimmed but tappable, which is the deck's whole gesture: the row is not disabled, it goes
 * somewhere. It appears only on a phone with a store to send anyone to. On a desktop there
 * is no camera anybody expected and no phone in the room to hand off to, and typing the
 * digits from the sleeve is simply the way this is done there.
 */
function ScanRow({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const [handing, setHanding] = useState(false);
  if (appStoreUrl(mobilePlatform()) === null) return null;

  return (
    <>
      <div className="flex-none px-4 pt-3 sm:px-6">
        <button
          type="button"
          onClick={() => setHanding(true)}
          className="flex min-h-15 w-full items-center gap-3.25 rounded-[10px] border border-line bg-ink/3 px-3.5 py-3 text-left"
        >
          <ScanBarcode
            size={18}
            strokeWidth={1.75}
            className="flex-none text-ink-subtle"
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.75">
              <span className="text-[13.5px] font-semibold text-ink-muted">
                {t("addDialog.scanRow.title")}
              </span>
              <span className="rounded-[3px] bg-ink/8 px-1.25 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-ink-muted">
                {t("addDialog.scanRow.appOnly")}
              </span>
            </span>
            <span className="mt-0.5 block text-[11.5px] text-ink-subtle">
              {t("addDialog.scanRow.why")}
            </span>
          </span>
          <ChevronRight
            size={16}
            strokeWidth={1.75}
            className="flex-none text-ink/30"
            aria-hidden
          />
        </button>
      </div>
      {handing && (
        <ScanHandoffSheet
          onClose={() => setHanding(false)}
          onSearchInstead={() => {
            setHanding(false);
            logic.setTab("SEARCH");
          }}
        />
      )}
    </>
  );
}

function SearchTab({
  logic,
  hunting,
}: { readonly logic: Logic; readonly hunting: WishlistItem | null }) {
  const { t } = useTranslation();
  const barcode = logic.tab === "BARCODE";

  return (
    <>
      <form
        className="flex-none px-4 pt-4 sm:px-6 sm:pt-4.5"
        onSubmit={(event) => {
          event.preventDefault();
          logic.submit();
        }}
      >
        <label className="flex h-11 items-center gap-2.5 rounded-[9px] border border-line bg-surface px-3.5 focus-within:border-ink">
          {barcode ? (
            <ScanBarcode
              size={16}
              strokeWidth={1.75}
              className="flex-none text-ink-muted"
              aria-hidden
            />
          ) : (
            <Search size={16} strokeWidth={1.75} className="flex-none text-ink-muted" aria-hidden />
          )}
          <input
            // Remounted per tab so the barcode field starts empty rather than holding a
            // half-typed album title that can never match a barcode.
            key={logic.tab}
            value={logic.term}
            onChange={(event) => logic.setTerm(event.target.value)}
            inputMode={barcode ? "numeric" : "text"}
            placeholder={t(
              barcode ? "addDialog.barcodePlaceholder" : "addDialog.searchPlaceholder",
            )}
            aria-label={t(barcode ? "addDialog.tab.BARCODE" : "addDialog.tab.SEARCH")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-subtle"
          />
          <button type="submit" disabled={!logic.canSubmit} className="sr-only">
            {t("addDialog.tab.SEARCH")}
          </button>
          {/* The spinner belongs to the field that caused the wait, so the cause and the
              wait are in the same place. It replaces the clear button rather than sitting
              beside it, which keeps the field's width from twitching mid-search. */}
          {logic.searching ? (
            <FieldSpinner />
          ) : logic.term !== "" ? (
            <button
              type="button"
              onClick={() => logic.setTerm("")}
              aria-label={t("addDialog.clearSearch")}
              className="flex-none text-ink-subtle hover:text-ink"
            >
              <X size={15} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
        </label>
      </form>

      {barcode && <ScanRow logic={logic} />}

      {hunting !== null && <HuntingBanner item={hunting} />}

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-2 pb-1 sm:px-6">
        {/*
         * A Cross on the list as one block, never per row — and keyed on the term that
         * was actually searched, so it runs when the results change rather than on every
         * keystroke. While the debounce is pending the old results stay put at full
         * opacity; the spinner in the field is the only thing that says anything is
         * happening.
         */}
        <div key={logic.submittedTerm} className="mc-cross">
          <Results logic={logic} />
        </div>
      </div>

      <SheetFooter logic={logic} />
    </>
  );
}

/**
 * Screen 16d's reminder — what you wrote down when you put this record on the list.
 *
 * A wish names an album, not a pressing, so the results below are still a choice. The note
 * is here because it is usually the thing that decides which of them is the right one.
 */
function HuntingBanner({ item }: { readonly item: WishlistItem }) {
  const { t } = useTranslation();

  return (
    <div className="mx-6 mt-3 flex flex-none items-start gap-3 rounded-xl border border-line bg-canvas px-3.5 py-3">
      <Heart
        size={15}
        strokeWidth={1.75}
        className="mt-0.5 flex-none text-ink-subtle"
        aria-hidden
      />
      <div className="min-w-0 text-[12px] leading-relaxed">
        <span className="font-semibold">{item.title}</span>
        <span className="text-ink-muted"> · {t("wishlist.fromYourWishlist")}</span>
        {item.note !== null && (
          <div className="text-ink-muted">{t("wishlist.yourNote", { note: item.note })}</div>
        )}
      </div>
    </div>
  );
}

/**
 * The sheet's standing footer — a receipt, not a control.
 *
 * It used to hold "Add and edit details", which made every addition a two-step: pick a
 * row, press the footer, dismiss a form. Both destinations now live on the row itself and
 * write on the click, so what is left down here is what actually helps — how many you have
 * added this sitting, and the promise that nothing is waiting on you to fill anything in.
 */
function SheetFooter({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const total = logic.added.shelf + logic.added.wishlist;

  return (
    <div className="flex flex-none items-center justify-between gap-4 border-t border-line bg-surface px-4 py-3 pb-safe sm:px-6 sm:py-3.5">
      {/* Nothing on the left until something has been added: an empty count would be a
          zero nobody needs, and the header already says what the sheet is for. */}
      {total === 0 ? (
        <span />
      ) : (
        <div className="flex items-center gap-2.5 text-[12px] font-medium text-ink-muted">
          <span className="flex size-[22px] items-center justify-center rounded-full bg-ink text-surface">
            <Check size={12} strokeWidth={2.4} aria-hidden />
          </span>
          {t("addDialog.addedThisSession", {
            count: total,
            shelf: logic.added.shelf,
            wishlist: logic.added.wishlist,
          })}
        </div>
      )}
      {/* Under 640px the sentence takes three lines of a footer that is one line tall. */}
      <span className="hidden text-[11.5px] text-ink-muted sm:block">
        {t("addDialog.laterHint")}
      </span>
    </div>
  );
}

function Results({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  /**
   * Artists are a second request, a second behind the releases one — MusicBrainz allows
   * us one per second. Rendered as soon as they land rather than held back until both
   * halves are in, so the list fills from the top instead of appearing all at once.
   */
  const artists = useArtistSearchLogic(logic.artistQuery, logic.artistQuery !== "");

  if (!logic.hasSearched) return <RecentSearches logic={logic} />;

  const noReleases = !logic.searching && !logic.failed && logic.results.length === 0;
  // Only a dead end if neither half found anything. An artist match with no title match is
  // the normal shape of searching a band name, and 9b would be a lie there.
  if (noReleases && artists.total === 0 && !artists.loading) return <NoMatches logic={logic} />;

  return (
    <>
      <ArtistResults logic={artists} onOpen={logic.showArtist} />

      {logic.searching ? (
        <SearchingRows />
      ) : logic.failed ? (
        <p className="pt-4 text-sm text-ink-muted">{t("add.failed")}</p>
      ) : (
        <RecordResults logic={logic} />
      )}
    </>
  );
}

/** Screen 5a's list, before anything has been typed. */
function RecentSearches({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  if (logic.tab === "BARCODE" || logic.recentSearches.length === 0) return null;

  return (
    <>
      <div className="flex items-center justify-between pt-3 pb-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
          {t("addDialog.recent")}
        </span>
        <button
          type="button"
          onClick={logic.clearRecent}
          className="text-[11.5px] font-medium text-ink-muted hover:text-ink"
        >
          {t("addDialog.clearRecent")}
        </button>
      </div>
      {logic.recentSearches.map((term) => (
        <button
          key={term}
          type="button"
          onClick={() => logic.repeatSearch(term)}
          className="flex w-full items-center gap-3 border-t border-line py-3 text-left"
        >
          <Clock size={16} strokeWidth={1.75} className="flex-none text-ink-subtle" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm">{term}</span>
          <ArrowUpLeft size={15} strokeWidth={1.75} className="text-ink-subtle" aria-hidden />
        </button>
      ))}
    </>
  );
}

/**
 * The wait, in the shape of what is coming (screen 9a).
 *
 * Every dimension here is copied from ResultRow below — the 52px sleeve, the three lines,
 * the round add button — so the results replace the placeholders without moving anything
 * the reader had already started looking at.
 */
function SearchingRows() {
  const { t } = useTranslation();

  return (
    <>
      <output className="flex items-center gap-2.5 pt-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
        {t("addDialog.searchingSource")}
        <PulsingDots />
      </output>
      {SKELETON_ROWS.map(([first, second, third]) => (
        <div key={first + second} className="flex items-center gap-3.5 border-t border-line py-3">
          <Skeleton className="h-13 w-13 flex-none rounded-sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <Skeleton className="h-[11px] rounded-[3px]" style={{ width: first }} />
            <Skeleton tone="soft" className="h-[9px] rounded-[3px]" style={{ width: second }} />
            <Skeleton tone="faint" className="h-2 rounded-[3px]" style={{ width: third }} />
          </div>
          <div className="h-8 w-[68px] flex-none rounded-lg bg-ink/5" aria-hidden />
        </div>
      ))}
    </>
  );
}

/**
 * Screen 9b — the search ran and matched nothing.
 *
 * The point of the screen is the two ways out: a barcode is the one identifier that is
 * printed on the sleeve and cannot be misspelled, and manual entry (14b) is the way in for
 * a pressing the archive has never heard of.
 */
function NoMatches({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const barcode = logic.tab === "BARCODE";

  return (
    <div className="flex flex-col items-center px-5 pt-10 pb-9 text-center">
      <SearchX size={28} strokeWidth={1.5} className="text-ink-subtle" aria-hidden />
      <h3 className="mt-4 font-serif text-[21px] leading-tight">
        {t("addDialog.noMatches.title")}
      </h3>
      <p className="mt-2 max-w-[340px] text-[13px] leading-relaxed text-pretty text-ink-muted">
        {barcode
          ? t("addDialog.noBarcodeMatch", { barcode: logic.submittedTerm })
          : t("addDialog.noMatches.body")}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        <Button
          variant="secondary"
          onClick={() => logic.setTab(barcode ? "SEARCH" : "BARCODE")}
          className="h-[34px] rounded-lg px-3.5 text-[12.5px]"
        >
          {barcode ? (
            <Search size={15} strokeWidth={1.75} aria-hidden />
          ) : (
            <ScanBarcode size={15} strokeWidth={1.75} aria-hidden />
          )}
          {t(barcode ? "addDialog.noMatches.byTitle" : "addDialog.noMatches.scan")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => logic.setTab("MANUAL")}
          className="h-[34px] rounded-lg px-3.5 text-[12.5px]"
        >
          <Pencil size={15} strokeWidth={1.75} aria-hidden />
          {t("addDialog.tab.MANUAL")}
        </Button>
      </div>
    </div>
  );
}

/**
 * One result, with both destinations on it.
 *
 * Equal weight, wishlist left and shelf right, because a search turns up records you own
 * and records you covet in the same list and neither is the correction of the other. The
 * row is no longer selectable: there is no footer left to act on a selection, and a click
 * now means one specific thing rather than "this is the one I mean".
 *
 * Owning a copy already does not take the buttons away. It says so on the line and renames
 * the right-hand one, because a second pressing is a normal thing to buy and hiding the
 * button is how a shelf ends up missing the record somebody was standing there holding.
 */

/**
 * What a search answers with: pressings for a scan, records for anything typed.
 *
 * The count names both numbers because they differ, and visibly so. Eight rows folding
 * into five records is the change this turn is about, and saying only one of them would
 * make the list look like it had lost something.
 */
function RecordResults({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();

  if (logic.scanned) {
    return (
      <section>
        <div className="flex items-center justify-between pt-4.5 pb-1">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
            {t("addDialog.matchCount", { count: logic.results.length })}
          </h3>
        </div>
        {logic.results.map((release) => (
          <ResultRow key={release.id} release={release} logic={logic} />
        ))}
      </section>
    );
  }

  const found = logic.records.length + logic.singles.length;
  if (found === 0) {
    return (
      <p className="py-3 text-[12.5px] text-ink-muted">{t("addDialog.noReleasesButArtists")}</p>
    );
  }

  return (
    <>
      {logic.records.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between pt-4.5 pb-1">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
              {t("addDialog.records")}
            </h3>
            <span className="font-mono text-[10px] text-ink-subtle">
              {t("addDialog.recordCount", { results: found, records: logic.records.length })}
            </span>
          </div>
          {logic.records.map((group) => (
            <RecordRow key={group.album.albumId} group={group} logic={logic} />
          ))}
        </section>
      )}
      {logic.singles.length > 0 && <SinglesBlock singles={logic.singles} logic={logic} />}
    </>
  );
}

/**
 * One record, with the other editions of it folded underneath.
 *
 * The count sits on the right rather than under the title: the dialog's rows are wide, and
 * a chip beside the artist line reads as part of the record's name.
 */
function RecordRow({ group, logic }: { readonly group: RecordGroup; readonly logic: Logic }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { album, editions } = group;
  const owned = logic.ownedAlbumCopy(album);

  return (
    <div className="border-t border-line">
      <div className="flex items-center gap-3.5 py-3">
        <AlbumArt album={album} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold leading-tight">{album.title}</div>
          <div className="truncate text-[11.5px] leading-snug text-ink-muted">
            {album.artistName}
            {album.year !== null && ` · ${album.year}`}
          </div>
          {owned !== null && (
            <div className="flex items-center gap-1.5 truncate font-mono text-[10px] leading-snug text-accent-strong">
              <LibraryBig size={11} strokeWidth={2.2} aria-hidden />
              {owned.condition === null
                ? t("addDialog.ownedNoGrade", { year: new Date(owned.addedAt).getFullYear() })
                : t("addDialog.owned", {
                    grade: CONDITION_SHORT[owned.condition],
                    year: new Date(owned.addedAt).getFullYear(),
                  })}
            </div>
          )}
        </div>

        {editions.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((was) => !was)}
            aria-expanded={open}
            className={`flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] transition-colors ${
              open ? "bg-ink text-surface" : "bg-accent-soft text-accent-strong"
            }`}
          >
            {t("addDialog.otherEditions", { count: editions.length })}
            {open ? (
              <ChevronUp size={11} strokeWidth={2.2} aria-hidden />
            ) : (
              <ChevronDown size={11} strokeWidth={2.2} aria-hidden />
            )}
          </button>
        )}

        <AddPills album={album} logic={logic} owned={owned !== null} />
      </div>

      {open && (
        <div className="mb-1 ml-6.5 border-l border-line pl-4">
          <p className="pt-2 pb-0.5 text-[11.5px] leading-normal text-ink-muted">
            {t("addDialog.editionsHint")}
          </p>
          {editions.map((edition) => (
            <div
              key={edition.albumId}
              className="flex items-center gap-3 border-t border-line py-2"
            >
              <div className="min-w-0 flex-1">
                {/* Named by what makes it different: the record's own title is already on
                    the row above, and repeating it in every child is noise. */}
                <div className="truncate text-[12.5px] font-semibold leading-tight">
                  {editionLabel(edition)}
                </div>
                {edition.year !== null && (
                  <div className="truncate text-[11px] leading-snug text-ink-muted">
                    {edition.year}
                  </div>
                )}
              </div>
              <AddPills album={edition} logic={logic} owned={logic.isOwnedAlbum(edition)} small />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The two destinations every row offers. Wishlist left, shelf right, everywhere.
 *
 * Neither saves on the click any more. A record is not a pressing, so there is one
 * question left to ask, and these open the step that asks it -- with the answer already
 * filled in, so saying "any pressing" costs the same click as not being asked at all.
 */
function AddPills({
  album,
  logic,
  owned,
  small = false,
}: {
  readonly album: Album;
  readonly logic: Logic;
  readonly owned: boolean;
  readonly small?: boolean;
}) {
  const { t } = useTranslation();
  const size = small ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs";
  const icon = small ? 12 : 13;

  return (
    <div className="flex flex-none gap-1.5">
      <Button
        variant={owned ? "secondary" : "primary"}
        action="wish.add"
        onClick={() => logic.openPressingStep(album, "WISHLIST")}
        className={`flex-none rounded-full ${size}`}
      >
        <Heart size={icon} strokeWidth={2} aria-hidden />
        {t("addDialog.wishlist")}
      </Button>
      <Button
        variant={owned ? "secondary" : "primary"}
        action="copy.add"
        onClick={() => logic.openPressingStep(album, "SHELF")}
        className={`flex-none whitespace-nowrap rounded-full ${size}`}
      >
        {owned ? (
          <CopyPlus size={icon} strokeWidth={2} aria-hidden />
        ) : (
          <LibraryBig size={icon} strokeWidth={2} aria-hidden />
        )}
        {owned ? t("addDialog.secondCopy") : t("addDialog.shelf")}
      </Button>
    </div>
  );
}

/** How many singles are shown before the block offers the rest. */
const SHOWN_SINGLES = 1;

/**
 * The singles and EPs that merely share a title with the record above.
 *
 * Their own block, below the records, because a title search drowns in them: "if you
 * leave" returns the record once and then four unrelated covers. Apple sends no type
 * field, so the only thing that identifies them is that literal text in the title.
 */
function SinglesBlock({
  singles,
  logic,
}: { readonly singles: readonly Album[]; readonly logic: Logic }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? singles : singles.slice(0, SHOWN_SINGLES);
  const hidden = singles.length - shown.length;

  return (
    <section>
      <div className="flex items-baseline justify-between pt-5 pb-1">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
          {t("addDialog.singlesAndEps")}
        </h3>
        <span className="font-mono text-[10px] text-ink-subtle">{singles.length}</span>
      </div>
      {shown.map((single) => (
        <div key={single.albumId} className="flex items-center gap-3 border-t border-line py-2.5">
          <AlbumArt album={single} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[12.5px] font-semibold leading-tight">
                {single.title}
              </span>
              <span className="flex-none rounded bg-ink/[0.07] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-ink-subtle">
                {isEp(single.title) ? t("addDialog.epTag") : t("addDialog.singleTag")}
              </span>
            </div>
            <div className="truncate text-[11px] leading-snug text-ink-muted">
              {single.artistName}
              {single.year !== null && ` · ${single.year}`}
            </div>
          </div>
          <AddPills album={single} logic={logic} owned={logic.isOwnedAlbum(single)} small />
        </div>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="flex w-full items-center justify-center gap-1.5 pt-3 pb-1 text-[12.5px] font-medium text-accent-strong"
        >
          {t("addDialog.showMoreSingles", { count: hidden })}
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
      )}
    </section>
  );
}

/** Which of the two words to tag a row with, read the same way the split was made. */
function isEp(title: string): boolean {
  return /\bep$/i.test(title.trim());
}

export function ResultRow({
  release,
  logic,
}: {
  readonly release: Release;
  readonly logic: Logic;
}) {
  const { t } = useTranslation();
  const owned = logic.ownedCopy(release);
  const subtitle = releaseDisambiguation(release);

  return (
    <div className="flex items-center gap-3.5 border-t border-line py-3">
      {/* The real cover, not just the format silhouette. Picking between four pressings
          of the same album is largely a visual job, and the sleeve is the thing people
          recognise. The format is still named in the line below, and ReleaseArt falls
          back to the silhouette whenever the archive has nothing. */}
      <div className="h-13 w-[62px] flex-none">
        <ReleaseArt release={release} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold leading-tight">{release.title}</div>
        <div className="truncate text-[11.5px] leading-snug text-ink-muted">
          {release.artistName}
          {release.year !== null && ` · ${release.year}`}
          {` · ${FORMAT_LABELS[release.format]}`}
        </div>
        {owned !== null ? (
          <div className="flex items-center gap-1.5 truncate font-mono text-[10px] leading-snug text-accent-strong">
            <LibraryBig size={11} strokeWidth={2.2} aria-hidden />
            {owned.condition === null
              ? t("addDialog.ownedNoGrade", { year: new Date(owned.addedAt).getFullYear() })
              : t("addDialog.owned", {
                  grade: CONDITION_SHORT[owned.condition],
                  year: new Date(owned.addedAt).getFullYear(),
                })}
          </div>
        ) : (
          subtitle !== "" && (
            <div className="truncate font-mono text-[10px] leading-snug text-ink-subtle">
              {subtitle}
            </div>
          )
        )}
      </div>

      <div className="flex flex-none gap-1.5">
        <Button
          variant={owned === null ? "primary" : "secondary"}
          action="wish.add"
          onClick={() => logic.addWish(release)}
          loading={logic.wishingMbid === release.id}
          className="h-8 flex-none rounded-full px-3 text-xs"
        >
          {logic.wishingMbid !== release.id && <Heart size={13} strokeWidth={2} aria-hidden />}
          {t("addDialog.wishlist")}
        </Button>
        <Button
          variant={owned === null ? "primary" : "secondary"}
          action="copy.add"
          onClick={() => logic.addRelease(release)}
          loading={logic.addingMbid === release.id}
          className="h-8 flex-none whitespace-nowrap rounded-full px-3 text-xs"
        >
          {logic.addingMbid !== release.id &&
            (owned === null ? (
              <LibraryBig size={13} strokeWidth={2} aria-hidden />
            ) : (
              <CopyPlus size={13} strokeWidth={2} aria-hidden />
            ))}
          {owned === null ? t("addDialog.shelf") : t("addDialog.secondCopy")}
        </Button>
      </div>
    </div>
  );
}

function CsvTab({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line bg-surface p-6">
          <FileUp size={20} strokeWidth={1.6} className="text-ink-muted" aria-hidden />
          <div className="text-[13px] font-semibold">{t("addDialog.csv.title")}</div>
          <p className="max-w-md text-[11.5px] leading-normal text-ink-muted">
            {t("addDialog.csv.body")}
          </p>
          <input
            ref={input}
            type="file"
            accept=".csv,.mc,text/csv,application/zip"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) logic.importFile(file);
              // Cleared so re-picking the same file fires change again.
              event.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            onClick={() => input.current?.click()}
            loading={logic.importing}
            className="mt-1 h-[34px] rounded-lg px-3.5 text-[12.5px]"
          >
            {t("addDialog.csv.choose")}
          </Button>
          {/* The two kinds are reported differently because they promise differently: a
              spreadsheet *adds* copies and can fail to place a row, an archive puts back
              records that were already themselves. Saying "added" after a restore would
              describe the wrong thing happening. */}
          {logic.importResult?.kind === "CSV" && (
            <p className="text-[11.5px] text-ink-muted">
              {t("addDialog.csv.done", {
                added: logic.importResult.added,
                skipped: logic.importResult.skipped,
              })}
            </p>
          )}
          {logic.importResult?.kind === "MC" && (
            <p className="text-[11.5px] text-ink-muted">
              {t("addDialog.csv.doneArchive", {
                copies: logic.importResult.copies,
                photos: logic.importResult.photos,
                wishes: logic.importResult.wishes,
              })}
            </p>
          )}
          {logic.importFailed && (
            <p className="text-[11.5px] text-accent">
              {/* An archive says why it was refused — the wrong kind of zip, a damaged
                  photo, a file from a newer build — and passing that on is the difference
                  between "try again" and "this is not the file you think it is". */}
              {logic.importError ?? t("addDialog.csv.failed")}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-none items-center justify-end border-t border-line bg-surface px-4 py-3 pb-safe sm:px-6 sm:py-3.5">
        <Button
          variant="secondary"
          onClick={logic.close}
          className="h-[34px] rounded-lg px-3.5 text-[12.5px]"
        >
          {t("common.close")}
        </Button>
      </div>
    </>
  );
}
