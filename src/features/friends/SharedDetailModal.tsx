import { TileRating } from "@/components/TileRating";
import { Modal, useModalDismiss } from "@/components/ui";
import type { SharedDetail } from "@/features/friends/useSharedDetailLogic";
import { Tracklist } from "@/features/tracklist/Tracklist";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

/** One labelled fact in the sheet's grid. */
export interface DetailFact {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Condition codes are set in the bordered mono chip the deck uses everywhere. */
  readonly chip?: boolean;
  /**
   * A rating cell draws the star bar instead of `value`, which is then only the spoken
   * text. The stars are two colours, so they cannot be a string in a `<dd>` — but they are
   * still one fact in one cell, and hoisting them out of the grid would have cost the
   * sheet its "every field that is missing simply is not there" shape.
   */
  readonly stars?: number;
}

/** Everything the sheet draws, resolved by the shelf that opened it. */
export interface SharedDetailItem {
  /** Small mono line above the title — the wishlist says what kind of thing this is. */
  readonly eyebrow?: string;
  readonly title: string;
  readonly artistName: string;
  /** The sleeve, already sized to fill the square it is handed. */
  readonly art: ReactNode;
  readonly facts: readonly DetailFact[];
  /**
   * The phone's shorter grid (23e).
   *
   * Two columns fit four cells and no more at 390px, so media and sleeve share a line and
   * the added date moves down to `phoneFootnote`. Same facts, fewer cells.
   */
  readonly phoneFacts: readonly DetailFact[];
  readonly phoneFootnote?: string;
  /** The quiet word on the right of the footer: whose copy it is, or why a field is gone. */
  readonly note: string;
  /**
   * The release behind this record, when it has one (26c).
   *
   * Its own field rather than another `DetailFact` because the tracklist is not a fact: it
   * is a block of its own below the grid, it arrives after the sheet is drawn, and it has
   * three states the label-over-value shape cannot carry.
   */
  readonly releaseId?: string | null;
}

const LABEL = "font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-subtle";
const FOOTER = "font-mono text-[10.5px] text-ink-subtle";

/**
 * Screen 23a — one record off somebody else's shelf, lifted over the page it sits on.
 *
 * Read-only in the strongest sense: the visitor may have no account at all, so there is
 * nothing here to press except close and flip. The sleeve carries the sheet and everything
 * else is a short label over a value, which is what lets the layout survive a copy that
 * knows four facts and a copy that knows two — the grid closes up rather than leaving the
 * holes a fixed row of fields would.
 *
 * Prev/next sit on the dim rather than in the sheet, mirroring the arrow keys: inside they
 * would be two more things competing with the artwork, which is the one strong element the
 * screen is allowed.
 */
export function SharedDetailModal({
  item,
  detail,
}: { readonly item: SharedDetailItem; readonly detail: SharedDetail }) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <Modal
      onClose={detail.close}
      labelledBy={titleId}
      width="800px"
      align="center"
      phoneSheet
      // The grabber lives in PhoneHandle below, on the same row as the close.
      sheetHandle={false}
      overlay={
        <>
          <Flip
            side="prev"
            onClick={detail.prev}
            disabled={!detail.hasPrev}
            label={t("profile.detail.previous")}
          />
          <Flip
            side="next"
            onClick={detail.next}
            disabled={!detail.hasNext}
            label={t("profile.detail.next")}
          />
        </>
      }
      footnote={<Hints />}
    >
      <div
        className="relative flex min-h-0 flex-col overflow-y-auto p-[30px] max-sm:px-[18px] max-sm:pt-2.5 max-sm:pb-[22px]"
        {...detail.swipe}
      >
        <PhoneHandle />
        <Close className="absolute top-3.5 right-3.5 max-sm:hidden" />

        <div className="flex gap-8 max-sm:flex-col max-sm:gap-0">
          <div className="aspect-square w-[330px] flex-none overflow-hidden rounded-[10px] max-sm:mt-1.5 max-sm:w-full max-sm:rounded-xl">
            {item.art}
          </div>

          <div className="flex min-w-0 flex-1 flex-col pt-1.5 pr-[22px] max-sm:p-0">
            {item.eyebrow !== undefined && <span className={LABEL}>{item.eyebrow}</span>}
            <h2
              id={titleId}
              className={cn(
                "font-serif text-[34px] leading-[1.08] tracking-[-0.01em] text-pretty",
                "max-sm:text-[27px] max-sm:leading-[1.1]",
                item.eyebrow !== undefined && "mt-3",
                item.eyebrow === undefined && "max-sm:mt-[18px]",
              )}
            >
              {item.title}
            </h2>
            <p className="mt-2 font-serif text-[15px] leading-[1.4] text-ink-muted max-sm:mt-1.5 max-sm:text-[14px]">
              {item.artistName}
            </p>

            <div className="my-[22px] h-px bg-ink/10 max-sm:mt-4 max-sm:mb-3.5" />

            <Facts facts={item.facts} className="hidden sm:grid" />
            <Facts facts={item.phoneFacts} className="grid sm:hidden" phone />
          </div>
        </div>

        {/* 26c: full width under both columns, so the sleeve keeps the top of the sheet.
            Read-only like everything else here — the visitor may have no account at all. */}
        <Tracklist releaseId={item.releaseId} shared />

        <div
          className={cn(
            "mt-auto flex items-center justify-between gap-4 pt-6",
            "max-sm:mt-[18px] max-sm:border-ink/10 max-sm:border-t max-sm:pt-3.5",
            FOOTER,
          )}
        >
          <span className="max-sm:hidden">
            {t("profile.detail.position", { index: detail.index + 1, total: detail.total })}
          </span>
          <span className="hidden max-sm:inline">{item.phoneFootnote ?? item.note}</span>
          <span className="max-sm:hidden">{item.note}</span>
          <span className="hidden max-sm:inline">
            {t("profile.detail.positionSwipe", {
              index: detail.index + 1,
              total: detail.total,
            })}
          </span>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The grid of facts.
 *
 * Two columns, except when there are only a couple left: a lone pair spread across the
 * full width reads as a table with the rest of its cells missing, which is exactly the
 * impression the optional fields are meant to avoid.
 */
function Facts({
  facts,
  className,
  phone,
}: {
  readonly facts: readonly DetailFact[];
  readonly className: string;
  readonly phone?: boolean;
}) {
  if (facts.length === 0) return null;
  return (
    <dl
      className={cn(
        "m-0 gap-x-[26px] gap-y-5",
        phone === true && "gap-x-5 gap-y-3.5",
        facts.length <= 2 && !(phone === true) ? "grid-cols-1" : "grid-cols-2",
        className,
      )}
    >
      {facts.map((fact) => (
        <div key={fact.key}>
          <dt className={LABEL}>{fact.label}</dt>
          <dd
            className={cn(
              "m-0",
              fact.stars == null && "mt-[5px]",
              fact.chip === true
                ? "font-mono text-[11.5px] tracking-[0.06em]"
                : "text-[13.5px] font-medium",
              phone === true && fact.chip !== true && "text-[13px]",
            )}
          >
            {fact.stars != null ? (
              <TileRating rating={fact.stars} size="detail" />
            ) : fact.chip === true && !(phone === true) ? (
              <span className="rounded-[5px] border border-ink/15 px-[7px] py-[3px]">
                {fact.value}
              </span>
            ) : (
              fact.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The grabber and the close, which is the whole header a bottom sheet gets. */
function PhoneHandle() {
  const { t } = useTranslation();
  return (
    <div className="flex h-[26px] flex-none items-center justify-between sm:hidden">
      <span className="w-[34px]" aria-hidden />
      <span className="h-1 w-[38px] rounded-full bg-ink/15" aria-hidden />
      <span className="flex w-[34px] justify-end">
        <Close label={t("common.close")} />
      </span>
    </div>
  );
}

/** A bare icon rather than the chip `ModalClose` draws: nothing here competes with the art. */
function Close({ className, label }: { readonly className?: string; readonly label?: string }) {
  const { t } = useTranslation();
  const dismiss = useModalDismiss();
  return (
    <button
      type="button"
      onClick={dismiss}
      aria-label={label ?? t("common.close")}
      className={cn(
        "flex h-[30px] w-[30px] items-center justify-center rounded-lg",
        "text-ink-subtle transition-colors duration-(--mc-quick) hover:text-ink",
        className,
      )}
    >
      <X size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/**
 * One of the two arrows, pinned to the viewport rather than to the sheet.
 *
 * At an end of the shelf it stays where it is and goes quiet instead of disappearing: an
 * arrow that vanishes moves the other one, and the reader loses the pair they were aiming
 * at halfway through a flip.
 */
function Flip({
  side,
  onClick,
  disabled,
  label,
}: {
  readonly side: "prev" | "next";
  readonly onClick: () => void;
  readonly disabled: boolean;
  readonly label: string;
}) {
  const Icon = side === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "fixed top-1/2 -mt-[22px] flex h-11 w-11 items-center justify-center rounded-full",
        "bg-paper/90 text-ink shadow-[0_1px_3px_rgba(0,0,0,.18)]",
        "transition-opacity duration-(--mc-quick) hover:bg-paper disabled:opacity-30",
        "max-sm:hidden",
        side === "prev" ? "left-9" : "right-9",
      )}
    >
      <Icon size={19} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** What the keys do, said once on the dim where it costs the sheet nothing. */
function Hints() {
  const { t } = useTranslation();
  return (
    <p className="m-0 flex items-center gap-3.5 font-mono text-[10.5px] text-paper/60 max-sm:hidden">
      <span className="flex items-center gap-[5px]">
        <Key>←</Key>
        <Key>→</Key>
        {t("profile.detail.flip")}
      </span>
      <span className="flex items-center gap-[5px]">
        <Key>esc</Key>
        {t("profile.detail.dismiss")}
      </span>
    </p>
  );
}

function Key({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[19px] min-w-[19px] items-center justify-center rounded border border-paper/35 px-[5px] font-mono not-italic">
      {children}
    </kbd>
  );
}
