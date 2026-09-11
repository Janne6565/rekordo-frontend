import { releaseDisambiguation } from "@/api/releases";
import { ReleaseArt } from "@/components/ReleaseArt";
import { Button, Field, FieldSpinner, Modal, ModalClose } from "@/components/ui";
import { useWishDialogLogic } from "@/features/wishlist/useWishDialogLogic";
import { cn } from "@/lib/utils";
import type { Release, WishFormat, WishlistItem } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { ArrowLeft, Heart, ImagePlus, Pencil, Search, X } from "lucide-react";
import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

/** The four chips of screen 16c, in the deck's order: the three you hunt for, then "any". */
const CHIPS: readonly (WishFormat | null)[] = ["VINYL", "CD", "CASSETTE", null];

interface WishDialogProps {
  readonly onClose: () => void;
  /** The entry being edited, or null when this is a new one. */
  readonly entry?: WishlistItem | null;
  /** A release the caller already picked — the heart on a search result (screen 16c). */
  readonly release?: Release | null;
}

/**
 * Screen 16c — the sheet every way onto the wishlist lands in.
 *
 * One sheet, several doors: a search result's heart, a row on the wishlist page, or the
 * search this sheet runs itself. They all end at the same two questions, which is what
 * makes "adding it twice just reopens this sheet" true rather than aspirational.
 */
export function WishDialog({ onClose, entry = null, release = null }: WishDialogProps) {
  const { t } = useTranslation();
  // A release handed in by the caller skips the search entirely: it is already the answer
  // to the only question the search asks.
  const logic = useWishDialogLogic(entry, onClose, release);
  const titleId = useId();

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      width="520px"
      holdOnBackdrop
      phoneSheet
      sheetHeight="large"
    >
      <div className="flex flex-none items-start justify-between gap-4 px-6 pt-5.5">
        <div className="min-w-0">
          <h2 id={titleId} className="font-serif text-2xl leading-[1.1]">
            {t(logic.editing ? "wishlist.editTitle" : "wishlist.addTitle")}
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-muted">{t("wishlist.addLede")}</p>
        </div>
        <ModalClose onClose={onClose} label={t("common.close")} />
      </div>

      {logic.step === "PICK" && <PickStep logic={logic} />}
      {logic.step === "MANUAL" && <ManualStep logic={logic} />}
      {logic.step === "DETAILS" && logic.subject !== null && <DetailsStep logic={logic} />}
    </Modal>
  );
}

type Logic = ReturnType<typeof useWishDialogLogic>;

function PickStep({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex-none px-6 pt-4">
        <label className="flex h-11 items-center gap-2.5 rounded-xl border border-line bg-canvas px-3.5">
          <Search size={16} strokeWidth={1.75} className="flex-none text-ink-muted" aria-hidden />
          <input
            value={logic.term}
            onChange={(event) => logic.setTerm(event.target.value)}
            placeholder={t("wishlist.searchPlaceholder")}
            aria-label={t("wishlist.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-subtle"
          />
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
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 pt-2 pb-1">
        {!logic.hasSearched ? (
          <p className="py-6 text-[12.5px] text-ink-muted">{t("wishlist.searchHint")}</p>
        ) : logic.failed ? (
          <p className="py-6 text-[12.5px] text-ink-muted">{t("add.failed")}</p>
        ) : !logic.searching && logic.results.length === 0 ? (
          <p className="py-6 text-[12.5px] text-ink-muted">{t("add.noResults")}</p>
        ) : (
          logic.results.map((release) => (
            <button
              key={release.id}
              type="button"
              onClick={() => logic.pick(release)}
              className="flex w-full items-center gap-3.5 border-t border-line py-3 text-left hover:bg-canvas/60"
            >
              <div className="h-12 w-[58px] flex-none">
                <ReleaseArt release={release} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold leading-tight">
                  {release.title}
                </div>
                <div className="truncate text-[11.5px] leading-snug text-ink-muted">
                  {release.artistName}
                  {release.year !== null && ` · ${release.year}`}
                  {` · ${FORMAT_LABELS[release.format]}`}
                </div>
                {releaseDisambiguation(release) !== "" && (
                  <div className="truncate font-mono text-[10px] leading-snug text-ink-subtle">
                    {releaseDisambiguation(release)}
                  </div>
                )}
              </div>
              {logic.isWished(release) && (
                <span className="flex-none px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
                  {t("wishlist.onWishlist")}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Screen 16f's fourth way in. A record nobody catalogued is still a record you are
          hunting for, and the archive being silent about it is not a reason to be. */}
      <div className="flex flex-none items-center justify-between gap-4 border-t border-line bg-surface px-6 py-3.5">
        <span className="text-[11.5px] text-ink-muted">{t("wishlist.manualHint")}</span>
        <Button
          variant="secondary"
          onClick={logic.startManual}
          className="h-[34px] flex-none rounded-lg px-3.5 text-[12.5px]"
        >
          <Pencil size={14} strokeWidth={1.75} aria-hidden />
          {t("wishlist.manualAction")}
        </Button>
      </div>
    </>
  );
}

function ManualStep({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto px-6 pt-4 pb-2">
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={t("manual.title")} className="col-span-2">
            {(id) => (
              <input
                id={id}
                value={logic.typed.title}
                onChange={(event) => logic.setTyped({ title: event.target.value })}
                className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm outline-none focus:border-ink"
              />
            )}
          </Field>
          <Field label={t("manual.artist")}>
            {(id) => (
              <input
                id={id}
                value={logic.typed.artistName}
                onChange={(event) => logic.setTyped({ artistName: event.target.value })}
                className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm outline-none focus:border-ink"
              />
            )}
          </Field>
          <Field label={t("manual.year")}>
            {(id) => (
              <input
                id={id}
                value={logic.typed.year}
                onChange={(event) => logic.setTyped({ year: event.target.value })}
                inputMode="numeric"
                className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm outline-none focus:border-ink"
              />
            )}
          </Field>
        </div>
      </div>

      <div className="flex flex-none items-center justify-between gap-4 border-t border-line bg-surface px-6 py-3.5">
        <Button
          variant="secondary"
          onClick={logic.back}
          className="h-[34px] rounded-lg px-3.5 text-[12.5px]"
        >
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
          {t("common.back")}
        </Button>
        <Button
          onClick={logic.confirmManual}
          disabled={!logic.canConfirmManual}
          className="h-[34px] rounded-lg px-3.5 text-[12.5px]"
        >
          {t("common.save")}
        </Button>
      </div>
    </>
  );
}

/**
 * The one picture a wish can own (design turn 18, widened in 19).
 *
 * Every entry may carry one now, not only a record no catalogue has. The catalogue's
 * answer is one pressing's sleeve among several — often not the one you are hunting for —
 * and a wish is a note to yourself, so the picture on it should be the one you recognise
 * the record by. The chosen file is not written until the sheet is saved: an image
 * attached to an entry somebody then abandoned would be bytes nothing ever references.
 */
function CoverImageField({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const describedBy = useId();
  const chosen = logic.subjectPictureSrc !== null;

  return (
    <div className="pt-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
        {t("wishlist.coverImage")}
      </span>
      <div className="mt-2 flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => input.current?.click()}
          aria-describedby={describedBy}
          className="h-[34px] flex-none rounded-lg px-3.5 text-[12.5px]"
        >
          <ImagePlus size={14} strokeWidth={1.75} aria-hidden />
          {t(chosen ? "wishlist.coverImageReplace" : "wishlist.coverImageAction")}
        </Button>
        {/* Only once there is one to take off, and never as a confirm step: nothing is
            written until the sheet is saved, so closing it is the undo. */}
        {logic.canDropImage && (
          <button
            type="button"
            onClick={logic.dropImage}
            className="flex-none text-[11.5px] font-medium text-ink-muted hover:text-ink"
          >
            {t("wishlist.coverImageRemove")}
          </button>
        )}
        <p id={describedBy} className="min-w-0 flex-1 text-[11.5px] leading-snug text-ink-muted">
          {logic.imageRejected === "size"
            ? t("wishlist.coverImageTooBig")
            : logic.imageRejected === "type"
              ? t("wishlist.coverImageWrongType")
              : t(
                  logic.manualSubject ? "wishlist.coverImageHintManual" : "wishlist.coverImageHint",
                )}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept={logic.acceptedImages}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) logic.chooseImage(file);
          // Cleared so picking the same file twice still fires a change.
          event.target.value = "";
        }}
      />
    </div>
  );
}

function DetailsStep({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const subject = logic.subject;
  if (subject === null) return null;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto px-6 pt-4 pb-2">
        <div className="flex items-center gap-3.5 rounded-xl border border-line bg-canvas p-3">
          <div className="h-13 w-[62px] flex-none">
            {/* The format is the one the chips below are choosing, not the pressing's: the
                tile should follow what is being asked for as it is asked for. */}
            <ReleaseArt
              release={{ coverArtUrl: logic.subjectCoverArtUrl }}
              previewSrc={logic.subjectPictureSrc}
              format={logic.format ?? "OTHER"}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold leading-tight">
              {subject.title}
            </div>
            <div className="truncate text-[11.5px] leading-snug text-ink-muted">
              {subject.artistName}
              {subject.year !== null && ` · ${subject.year}`}
              {subject.label !== null && ` · ${subject.label}`}
            </div>
          </div>
          {/* The release is the one part of an entry that cannot be edited later — an entry
              for a different record is a different entry — so this way back only exists
              while the entry is still being made. */}
          {!logic.editing && (
            <button
              type="button"
              onClick={logic.back}
              className="flex-none text-[11.5px] font-medium text-ink-muted hover:text-ink"
            >
              {t("wishlist.changeRelease")}
            </button>
          )}
        </div>

        {logic.canUploadImage && <CoverImageField logic={logic} />}

        <div className="pt-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
            {t("wishlist.wantedFormat")}
          </span>
          <div className="mt-2 flex gap-1.5">
            {CHIPS.map((chip) => (
              <button
                key={chip ?? "ANY"}
                type="button"
                onClick={() => logic.setFormat(chip)}
                aria-pressed={logic.format === chip}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] transition-colors duration-(--mc-quick)",
                  logic.format === chip
                    ? "bg-ink font-semibold text-paper"
                    : "border border-line bg-surface font-medium text-ink-muted hover:bg-canvas",
                )}
              >
                {chip === null ? t("wishlist.anyFormat") : FORMAT_LABELS[chip]}
              </button>
            ))}
          </div>
        </div>

        <Field label={t("wishlist.note")} className="pt-4">
          {(id) => (
            <textarea
              id={id}
              value={logic.note}
              onChange={(event) => logic.setNote(event.target.value)}
              rows={3}
              placeholder={t("wishlist.notePlaceholder")}
              className="w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-ink placeholder:text-ink-subtle"
            />
          )}
        </Field>
      </div>

      <div className="flex flex-none items-center justify-between gap-4 border-t border-line bg-surface px-6 py-3.5">
        <span className="text-[11.5px] text-ink-muted">{t("wishlist.oneEntryHint")}</span>
        <Button
          action="wish.save"
          onClick={logic.save}
          loading={logic.saving}
          className="h-[34px] flex-none rounded-lg px-3.5 text-[12.5px]"
        >
          {!logic.saving && <Heart size={14} strokeWidth={2} aria-hidden />}
          {t(logic.editing ? "common.save" : "wishlist.addToWishlist")}
        </Button>
      </div>
    </>
  );
}
