import { ReleaseArt } from "@/components/ReleaseArt";
import {
  Button,
  Field,
  Modal,
  ModalClose,
  useModalDismiss,
  useModalRefused,
} from "@/components/ui";
import { CHOOSABLE_FORMATS } from "@/domain/formats";
import { useCopyDetailsLogic } from "@/features/copy/useCopyDetailsLogic";
import { ConditionScale } from "@/features/detail/ConditionScale";
import { PhotoManager } from "@/features/photos/PhotoManager";
import { usePhotoStripLogic } from "@/features/photos/usePhotoStripLogic";
import { Tracklist } from "@/features/tracklist/Tracklist";
import { cn } from "@/lib/utils";
import type { Format } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { Calendar, Eye, EyeOff, HardDrive, Star } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

/**
 * Which of the two entry points opened it (turn 12).
 *
 * `ADD` is step two of the add flow (8d): the copy was written a moment ago and says
 * nothing about itself yet. `EDIT` is the same field set reached from the detail page
 * (12b), where the copy already has answers and its pictures are managed. One dialog
 * rather than two, because a second implementation of these seven fields is how the add
 * flow and the edit flow start disagreeing about what a copy can say.
 */
export type CopyDialogMode = "ADD" | "EDIT";

const MANUAL_INPUT =
  "h-9.5 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-ink placeholder:text-ink-subtle";

interface CopyDetailsDialogProps {
  readonly copyId: string;
  readonly mode?: CopyDialogMode;
  readonly onClose: () => void;
  /** "Back" — returns to the add sheet the copy was picked in. Add only. */
  readonly onBack?: () => void;
  /** "Remove copy" — the footer's destructive action. Edit only. */
  readonly onRemove?: () => void;
  readonly removing?: boolean;
}

/**
 * Screens 8d and 12b — where a copy stops being a release and becomes yours.
 *
 * The copy already exists by the time this opens, in both modes: adding writes it the
 * moment a release is picked. Closing without saving therefore loses the details, not the
 * copy, which is the right way round — a record you own is worth keeping even if you never
 * got round to grading it.
 *
 * What differs between the two is only the frame: the eyebrow, what fills the left column
 * (the sleeve while adding, the image editor while editing) and the footer. The fields
 * themselves are one set, written through one hook.
 */
export function CopyDetailsDialog({
  copyId,
  mode = "ADD",
  onClose,
  onBack,
  onRemove,
  removing = false,
}: CopyDetailsDialogProps) {
  const { t } = useTranslation();
  const logic = useCopyDetailsLogic(copyId, onClose);
  const photos = usePhotoStripLogic(copyId);
  const titleId = useId();

  const editing = mode === "EDIT";
  const release = logic.release;

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      width={editing ? "780px" : "720px"}
      phoneSheet
      sheetHeight="large"
      holdOnBackdrop={logic.dirty}
    >
      <div className="flex flex-none items-start justify-between gap-4 border-b border-line px-6 pt-5.5 pb-4.5">
        <div>
          <div className="flex items-center gap-2.25 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
            {editing ? (
              t("copyDetails.editTitle")
            ) : (
              <>
                {t("copyDetails.step")}
                <span className="h-0.5 w-6.5 bg-ink/20" aria-hidden />
                {t("copyDetails.yourCopy")}
              </>
            )}
          </div>
          <h2 id={titleId} className="mt-2 font-serif text-2xl leading-[1.1]">
            {release?.title ?? "—"}
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {release === undefined
              ? ""
              : [
                  release.artistName,
                  release.year ?? null,
                  FORMAT_LABELS[logic.fields.format === "" ? release.format : logic.fields.format],
                  release.label,
                  release.catalogNumber,
                  release.country,
                ]
                  .filter((part) => part !== null && part !== "")
                  .join(" · ")}
          </p>
        </div>
        <ModalClose onClose={onClose} label={t("common.close")} />
      </div>

      <form
        className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-5 sm:px-6 sm:py-5.5"
        onSubmit={(event) => {
          event.preventDefault();
          logic.save();
        }}
        id={`${titleId}-form`}
      >
        {/* Stacked under 640px (24f): the sleeve column is 180px wide and the fields
            beside it would be left with 150px, which is narrower than a date. */}
        <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
          {/* The sleeve while adding (8d), the whole image list while editing (12b): the
            pictures of a copy are worth managing where its other answers are, and the add
            step has none of them yet. */}
          <div className="flex-none">
            {editing ? (
              <PhotoManager logic={photos} release={release} />
            ) : (
              <div className="h-45 w-[216px] max-sm:mx-auto">
                <ReleaseArt
                  release={release}
                  format={logic.fields.format === "" ? undefined : logic.fields.format}
                  loading="eager"
                />
              </div>
            )}
            <div className="mt-4.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
              {t("copyDetails.format")}
            </div>
            {/* Editable on every copy: the archive answers for the pressing, but what is on
              your shelf can be a tape of a record it only lists as vinyl. Picking the
              catalogue's own format again puts the copy back to following it. */}
            <FormatChips
              format={
                logic.fields.format === "" ? (release?.format ?? "OTHER") : logic.fields.format
              }
              onSelect={(format) => logic.set("format", format)}
            />
            {/* Said only where it is surprising: the header above still names the archive's
              pressing, and this is why the two lines disagree. */}
            {release !== undefined &&
              logic.fields.format !== "" &&
              logic.fields.format !== release.format && (
                <p className="mt-1.5 text-[11px] text-ink-subtle">
                  {t("copyDetails.formatDiffers", { format: FORMAT_LABELS[release.format] })}
                </p>
              )}
          </div>

          <div className="min-w-0 flex-1">
            {/* Only a hand-entered copy carries its pressing's facts, and only it can
              correct them — no archive is ever going to fix a typo in a bootleg. */}
            {logic.manual && (
              <div className="mb-5 border-b border-line pb-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                  {t("manual.pressing")}
                </div>
                <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={t("manual.artist")} required>
                    {(id) => (
                      <input
                        id={id}
                        value={logic.fields.artist}
                        onChange={(event) => logic.set("artist", event.target.value)}
                        className={MANUAL_INPUT}
                      />
                    )}
                  </Field>
                  <Field label={t("manual.title")} required>
                    {(id) => (
                      <input
                        id={id}
                        value={logic.fields.title}
                        onChange={(event) => logic.set("title", event.target.value)}
                        className={MANUAL_INPUT}
                      />
                    )}
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Field label={t("manual.year")} className="w-20 flex-none">
                    {(id) => (
                      <input
                        id={id}
                        inputMode="numeric"
                        maxLength={4}
                        value={logic.fields.year}
                        onChange={(event) => logic.set("year", event.target.value)}
                        className={cn(MANUAL_INPUT, "font-mono")}
                      />
                    )}
                  </Field>
                  <Field label={t("manual.label")} className="min-w-0 flex-1">
                    {(id) => (
                      <input
                        id={id}
                        value={logic.fields.label}
                        onChange={(event) => logic.set("label", event.target.value)}
                        placeholder={t("manual.optional")}
                        className={MANUAL_INPUT}
                      />
                    )}
                  </Field>
                  <Field label={t("manual.catalogNumber")} className="min-w-0 flex-1">
                    {(id) => (
                      <input
                        id={id}
                        value={logic.fields.catalogNumber}
                        onChange={(event) => logic.set("catalogNumber", event.target.value)}
                        placeholder={t("manual.optional")}
                        className={MANUAL_INPUT}
                      />
                    )}
                  </Field>
                </div>
              </div>
            )}

            {/* Two grades side by side is 167px each at 390px, and the scale under them
              needs every pixel of the row it draws. One column under 640px. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ConditionScale
                scope="MEDIA"
                label={t("copyDetails.mediaCondition")}
                value={logic.fields.condition}
                onChange={(value) => logic.set("condition", value)}
              />
              {/* Right-hand column: the help panel is wider than the column, so it hangs
                from the right edge instead of running off the side of the modal. */}
              <ConditionScale
                scope="SLEEVE"
                align="end"
                label={t("copyDetails.sleeveCondition")}
                value={logic.fields.sleeveCondition}
                onChange={(value) => logic.set("sleeveCondition", value)}
              />

              <Field
                label={t("copyDetails.price")}
                error={logic.priceInvalid ? t("editor.badPrice") : null}
              >
                {(id) => (
                  <div className="flex h-10 items-center gap-2 rounded-[9px] border border-line bg-surface px-3.25">
                    <span className="text-[13px] text-ink-subtle">€</span>
                    <input
                      id={id}
                      inputMode="decimal"
                      value={logic.fields.price}
                      onChange={(event) => logic.set("price", event.target.value)}
                      placeholder="0.00"
                      className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-subtle"
                    />
                  </div>
                )}
              </Field>

              <Field
                label={t("copyDetails.date")}
                error={logic.dateInvalid ? t("editor.badDate") : null}
              >
                {(id) => (
                  <div className="flex h-10 items-center justify-between rounded-[9px] border border-line bg-surface px-3.25">
                    <input
                      id={id}
                      type="date"
                      value={logic.fields.purchasedOn}
                      onChange={(event) => logic.set("purchasedOn", event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
                    />
                    <Calendar
                      size={15}
                      strokeWidth={1.75}
                      className="text-ink-subtle"
                      aria-hidden
                    />
                  </div>
                )}
              </Field>

              <Field label={t("copyDetails.where")}>
                {(id) => (
                  <input
                    id={id}
                    value={logic.fields.purchasedAt}
                    onChange={(event) => logic.set("purchasedAt", event.target.value)}
                    placeholder={t("editor.wherePlaceholder")}
                    className="h-10 w-full rounded-[9px] border border-line bg-surface px-3.25 text-[13.5px] outline-none placeholder:text-ink-subtle"
                  />
                )}
              </Field>

              <fieldset>
                <legend className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                  {t("copyDetails.rating")}
                </legend>
                <div className="flex h-10 items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      // Pressing the current rating clears it — otherwise a mis-tap sticks.
                      onClick={() =>
                        logic.set("rating", logic.fields.rating === star ? null : star)
                      }
                      aria-label={t("editor.rate", { count: star })}
                      aria-pressed={star <= (logic.fields.rating ?? 0)}
                    >
                      <Star
                        size={19}
                        strokeWidth={1.5}
                        className={
                          star <= (logic.fields.rating ?? 0) ? "text-accent" : "text-ink/20"
                        }
                        fill={star <= (logic.fields.rating ?? 0) ? "currentColor" : "none"}
                      />
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <Field label={t("detail.notes")} className="mt-4.5">
              {(id) => (
                <textarea
                  id={id}
                  rows={3}
                  value={logic.fields.notes}
                  onChange={(event) => logic.set("notes", event.target.value)}
                  placeholder={t("editor.notesPlaceholder")}
                  className="w-full resize-y rounded-[9px] border border-line bg-surface p-3.25 text-[13px] leading-relaxed outline-none placeholder:text-ink-subtle"
                />
              )}
            </Field>
          </div>
        </div>

        {/* 26a: full width under the facts, so the sleeve keeps the top half of the sheet
            to itself. Last, because it is the one block on here nobody has to answer. */}
        <Tracklist
          releaseId={release?.id}
          trackCount={release?.trackCount}
          discCount={release?.discCount}
          copyId={copyId}
        />
      </form>

      {/*
       * 24k: the footer is fixed as soon as the body scrolls, which under 640px is always.
       * It wraps rather than squeezing — three things live in it, and "Remove copy" beside
       * a Save button beside a switch is 390px of nothing but controls.
       */}
      <div className="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-t border-line bg-surface px-4 py-3 pb-safe sm:px-6 sm:py-3.5">
        {editing ? (
          // 12b puts removing the copy in the footer's quiet corner: it is the one thing
          // here that cannot be undone, and it belongs where you are already deciding what
          // this copy is rather than at the bottom of a page you were only reading.
          <Button
            variant="secondary"
            action="copy.remove"
            onClick={onRemove}
            loading={removing}
            className="h-[34px] border-0 bg-transparent px-0 text-[12px] font-medium text-accent"
          >
            {t("detail.remove")}
          </Button>
        ) : (
          <span className="flex items-center gap-1.75 text-[11.5px] text-ink-muted">
            <HardDrive size={14} strokeWidth={1.75} aria-hidden />
            {logic.signedIn ? t("copyDetails.storageSignedIn") : t("copyDetails.storageGuest")}
          </span>
        )}
        {editing && logic.signedIn && (
          <HideSwitch hidden={logic.hidden} busy={logic.hiding} onToggle={logic.toggleHidden} />
        )}
        <DialogActions
          editing={editing}
          formId={`${titleId}-form`}
          canSave={logic.canSave}
          onBack={onBack}
          saving={logic.saving}
        />
      </div>
    </Modal>
  );
}

/**
 * Cancel and Save, as a child so they can reach the sheet's own dismiss.
 *
 * Cancel calls the caller's `onClose` nowhere: closing has to run the 120ms exit first,
 * and only the Modal knows when that is done. Save takes the accent ring while a backdrop
 * click is being refused — the click said "get me out of here", and this is the way out.
 */
function DialogActions({
  editing,
  formId,
  canSave,
  onBack,
  saving,
}: {
  readonly editing: boolean;
  readonly formId: string;
  readonly canSave: boolean;
  readonly onBack: (() => void) | undefined;
  readonly saving: boolean;
}) {
  const { t } = useTranslation();
  const dismiss = useModalDismiss();
  const refused = useModalRefused();

  return (
    // Full width on a phone: cancel keeps the width of its own word, the action that
    // saves takes the rest of the row.
    <div className="flex w-full gap-2.5 sm:w-auto">
      <Button
        variant="secondary"
        onClick={editing || onBack === undefined ? dismiss : onBack}
        className="h-11 flex-none rounded-lg px-3.5 text-[13px] sm:h-[34px] sm:text-[12.5px]"
      >
        {editing ? t("common.cancel") : t("common.back")}
      </Button>
      <Button
        type="submit"
        action="copy.save"
        form={formId}
        // A hand-entered copy with its artist or title cleared has nothing left to name it.
        disabled={!canSave}
        loading={saving}
        className={cn(
          "h-11 flex-1 rounded-lg px-3.5 text-[13px] transition-shadow duration-(--mc-quick)",
          "sm:h-[34px] sm:flex-none sm:text-[12.5px]",
          refused && "ring-2 ring-accent ring-offset-2 ring-offset-paper",
        )}
      >
        {editing ? t("copyDetails.saveChanges") : t("copyDetails.save")}
      </Button>
    </div>
  );
}

/**
 * The format, as a rail of chips.
 *
 * The deck draws four chips here, and seeing "Vinyl" against the three it is not is what
 * makes the answer legible — one lone chip reads as a label, not a position.
 *
 * Every one of them is pickable. The archive answers for the *pressing*, but what you own
 * can be a cassette of a record it only lists as vinyl, and the alternative — pointing the
 * copy at a different release — throws away its photos, grades and price to fix one word.
 * The copy's answer is stored as `manualFormat` and read back through `copyFormat`.
 *
 * Four, never five. A copy sitting at `OTHER` — the sentinel `copyFormat` answers with
 * when nothing has said yet — lights none of them, which is the question it actually is.
 */
function FormatChips({
  format,
  onSelect,
}: {
  readonly format: Format;
  readonly onSelect: (format: Format) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {CHOOSABLE_FORMATS.map((chip) => {
        const className = cn(
          "rounded-full px-2.5 py-1.25 text-[11.5px]",
          chip === format
            ? "bg-ink font-semibold text-paper"
            : "border border-line bg-surface font-medium text-ink-subtle",
        );
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onSelect(chip)}
            aria-pressed={chip === format}
            className={cn(className, chip !== format && "hover:text-ink")}
          >
            {FORMAT_LABELS[chip]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Keeps one record off every shelf but your own, whatever the sharing settings say.
 *
 * Only for signed-in accounts, because there is nothing to hide a copy *from* until the
 * collection can be seen by somebody else at all. Saved the moment it is pressed rather
 * than with the rest of the form — a privacy switch that waits for a Save button is one
 * people will believe they have already flipped.
 */
function HideSwitch({
  hidden,
  busy,
  onToggle,
}: { readonly hidden: boolean; readonly busy: boolean; readonly onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={hidden}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium text-ink-muted transition-colors duration-(--mc-quick) hover:bg-canvas disabled:opacity-50"
    >
      {hidden ? (
        <EyeOff size={14} strokeWidth={1.75} aria-hidden />
      ) : (
        <Eye size={14} strokeWidth={1.75} aria-hidden />
      )}
      {hidden ? t("copyDetails.hidden") : t("copyDetails.hide")}
    </button>
  );
}
