import { Button, Field } from "@/components/ui";
import { CHOOSABLE_FORMATS } from "@/domain/formats";
import { useManualEntryLogic } from "@/features/add/useManualEntryLogic";
import { cn } from "@/lib/utils";
import type { Condition, Format } from "@janne6565/rekordo-shared";
import { CONDITIONS, CONDITION_LABELS, FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const INPUT =
  "h-9.5 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-ink placeholder:text-ink-subtle";

interface ManualTabProps {
  readonly onClose: () => void;
  readonly onAdded: (copyId: string) => void;
}

/**
 * Screen 14b — the fourth tab of the add sheet, for a pressing no database has.
 *
 * Nothing on this tab is looked up, and the footer says so. Everything below the artist,
 * the title and the format is optional: a record you cannot find in an archive is usually
 * one you know very little about, and a form that insisted otherwise would simply not get
 * filled in.
 */
export function ManualTab({ onClose, onAdded }: ManualTabProps) {
  const { t } = useTranslation();
  const logic = useManualEntryLogic(onAdded);
  const file = useRef<HTMLInputElement>(null);
  const preview = useObjectUrl(logic.cover);

  return (
    <>
      <form
        className="min-h-0 flex-1 overflow-auto px-6 pt-5 pb-5.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (logic.canSave) logic.save();
        }}
      >
        <div className="flex items-start gap-5">
          <div className="flex w-28 flex-none flex-col gap-2.25">
            <button
              type="button"
              onClick={() => file.current?.click()}
              className="relative flex size-28 flex-col items-center justify-center gap-1.75 overflow-hidden rounded-[9px] border border-dashed border-ink/22 bg-surface text-ink-subtle hover:border-ink/40"
            >
              {preview === null ? (
                <>
                  <ImagePlus size={20} strokeWidth={1.6} aria-hidden />
                  <span className="font-mono text-[9px] uppercase tracking-[0.07em]">
                    {t("manual.dropCover")}
                  </span>
                </>
              ) : (
                <img src={preview} alt="" className="size-full object-cover" />
              )}
            </button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                logic.setCover(event.target.files?.[0] ?? null);
                // Cleared so re-picking the same file fires change again.
                event.target.value = "";
              }}
            />
            {logic.cover === null ? (
              <p className="text-[10.5px] leading-[1.45] text-ink-muted">{t("manual.coverHint")}</p>
            ) : (
              <button
                type="button"
                onClick={() => logic.setCover(null)}
                className="flex items-center gap-1 text-[10.5px] font-medium text-ink-muted hover:text-ink"
              >
                <X size={12} strokeWidth={2} aria-hidden />
                {t("manual.removeCover")}
              </button>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <div className="flex gap-3">
              <Field label={t("manual.artist")} required className="min-w-0 flex-1">
                {(id) => (
                  <>
                    <input
                      id={id}
                      value={logic.fields.artist}
                      onChange={(event) => logic.set("artist", event.target.value)}
                      placeholder={t("manual.artistPlaceholder")}
                      className={INPUT}
                    />
                    {/* Names already on the shelf, so a second tape by the same band does
                        not become a second artist through a different spelling. */}
                    {logic.artistSuggestions.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {logic.artistSuggestions.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => logic.useArtist(name)}
                            className="max-w-full truncate rounded-full border border-line bg-surface px-2.25 py-0.75 text-[11px] text-ink-muted hover:text-ink"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Field>
              <Field label={t("manual.title")} required className="min-w-0 flex-1">
                {(id) => (
                  <input
                    id={id}
                    value={logic.fields.title}
                    onChange={(event) => logic.set("title", event.target.value)}
                    placeholder={t("manual.titlePlaceholder")}
                    className={INPUT}
                  />
                )}
              </Field>
            </div>

            <div className="flex gap-3">
              <Field label={t("manual.year")} className="w-21 flex-none">
                {(id) => (
                  <input
                    id={id}
                    inputMode="numeric"
                    maxLength={4}
                    value={logic.fields.year}
                    onChange={(event) => logic.set("year", event.target.value)}
                    placeholder="————"
                    className={cn(INPUT, "font-mono")}
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
                    className={INPUT}
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
                    className={INPUT}
                  />
                )}
              </Field>
            </div>

            <fieldset>
              <legend className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                {t("manual.format")}
              </legend>
              <div className="mt-2 flex gap-1.75">
                {CHOOSABLE_FORMATS.map((format) => (
                  <FormatChip
                    key={format}
                    format={format}
                    selected={logic.fields.format === format}
                    onSelect={() => logic.set("format", format)}
                  />
                ))}
              </div>
            </fieldset>

            {/* Above the line: what the record is. Below it: what your copy of it is like. */}
            <div className="h-px bg-line" />

            <div className="flex gap-3">
              <Field label={t("copyDetails.mediaCondition")} className="min-w-0 flex-1">
                {(id) => (
                  <select
                    id={id}
                    value={logic.fields.condition}
                    onChange={(event) =>
                      logic.set("condition", event.target.value as Condition | "")
                    }
                    className={cn(INPUT, logic.fields.condition === "" && "text-ink-subtle")}
                  >
                    <option value="">{t("manual.notGraded")}</option>
                    {CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {CONDITION_LABELS[condition]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label={t("manual.paid")}
                error={logic.priceInvalid ? t("editor.badPrice") : null}
                className="w-24 flex-none"
              >
                {(id) => (
                  <div className="flex h-9.5 items-center gap-1.25 rounded-lg border border-line bg-surface px-3 focus-within:border-ink">
                    <span className="text-[13px] text-ink-subtle">€</span>
                    <input
                      id={id}
                      inputMode="decimal"
                      value={logic.fields.price}
                      onChange={(event) => logic.set("price", event.target.value)}
                      className="min-w-0 flex-1 bg-transparent font-mono text-[13.5px] outline-none"
                    />
                  </div>
                )}
              </Field>
              <Field label={t("manual.shop")} className="min-w-0 flex-1">
                {(id) => (
                  <input
                    id={id}
                    value={logic.fields.shop}
                    onChange={(event) => logic.set("shop", event.target.value)}
                    placeholder={t("editor.wherePlaceholder")}
                    className={INPUT}
                  />
                )}
              </Field>
            </div>

            <Field label={t("manual.note")}>
              {(id) => (
                <textarea
                  id={id}
                  rows={2}
                  value={logic.fields.note}
                  onChange={(event) => logic.set("note", event.target.value)}
                  placeholder={t("manual.notePlaceholder")}
                  className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-[13px] leading-relaxed outline-none placeholder:text-ink-subtle"
                />
              )}
            </Field>
          </div>
        </div>
      </form>

      <div className="flex flex-none items-center justify-between gap-4 border-t border-line bg-surface px-6 py-3.5">
        <span className="text-[11.5px] text-ink-muted">{t("manual.footerHint")}</span>
        <div className="flex flex-none gap-2.5">
          <Button
            variant="secondary"
            onClick={onClose}
            className="h-[34px] rounded-lg px-3.5 text-[12.5px]"
          >
            {t("common.cancel")}
          </Button>
          <Button
            action="copy.add-manual"
            onClick={logic.save}
            disabled={!logic.canSave}
            loading={logic.saving}
            className="h-[34px] rounded-lg px-3.5 text-[12.5px]"
          >
            {t("manual.save")}
          </Button>
        </div>
      </div>
    </>
  );
}

function FormatChip({
  format,
  selected,
  onSelect,
}: {
  readonly format: Format;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs transition-colors duration-(--mc-quick)",
        selected
          ? "bg-ink font-semibold text-paper"
          : "border border-line bg-surface font-medium text-ink-muted hover:bg-canvas",
      )}
    >
      {FORMAT_LABELS[format]}
    </button>
  );
}

/**
 * An object URL for the picked file, revoked when it changes.
 *
 * Object URLs pin their blob until revoked, so a person trying four covers would otherwise
 * leave all four in memory for the life of the tab.
 */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file === null) {
      setUrl(null);
      return;
    }
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file]);

  return url;
}
