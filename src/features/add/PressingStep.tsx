import { lookupPressings } from "@/api/releases";
import { AlbumArt } from "@/components/AlbumArt";
import { ReleaseArt } from "@/components/ReleaseArt";
import { Button } from "@/components/ui";
import type { useAddDialogLogic } from "@/features/add/useAddDialogLogic";
import type { Format, Release } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS, pressingList } from "@janne6565/rekordo-shared";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type Logic = ReturnType<typeof useAddDialogLogic>;

/** The formats a record is actually collected in. Digital is not a pressing. */
const FORMATS: readonly Format[] = ["VINYL", "CD", "CASSETTE"];

/** How many pressings the list shows before it offers the rest. */
const SHOWN_PRESSINGS = 4;

/**
 * Naming the pressing, which is the optional half of adding a record.
 *
 * Replaces the results inside the same modal rather than stacking a dialog on a dialog:
 * this is a mode of the one sheet, and the back link is how you leave it.
 *
 * Nothing is pre-picked, and that is the difference from the scanner's confirm card. A
 * scan can guess a pressing because there is an object in your hand with a barcode on it;
 * a search cannot, so "Any pressing" is the selected answer, the primary button is live
 * from the first frame, and choosing nothing stores nothing rather than a guess dressed
 * as a fact.
 */
export function PressingStep({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const step = logic.step;

  const pressings = useQuery({
    queryKey: ["pressings", step?.album.albumId],
    enabled: step !== null,
    queryFn: () => lookupPressings(step?.album.albumId as string, 100),
  });

  if (step === null) return null;
  const { album, destination } = step;
  // Filtered and ordered before it is counted: "34 pressings" has to mean the 34 rows
  // this list will actually show, not what Discogs happened to return.
  const rows = pressingList(pressings.data ?? [], logic.stepFormat);
  const shown = all ? rows : rows.slice(0, SHOWN_PRESSINGS);
  const chosenFormat = logic.stepFormat === null ? null : FORMAT_LABELS[logic.stepFormat];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center justify-between border-b border-line px-6 py-4">
        <button
          type="button"
          onClick={logic.closePressingStep}
          className="flex items-center gap-1.5 text-[13px] font-medium text-accent-strong"
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden />
          {t("pressingStep.back")}
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
          {t("pressingStep.step")}
        </span>
      </div>

      {/* The record stays fixed above the list: it is what all of this is about, and the
          list underneath is a refinement of it that can be ignored entirely. */}
      <div className="flex flex-none gap-4 border-b border-line px-6 pt-5 pb-4.5">
        <AlbumArt album={album} size={72} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-2xl leading-tight">{album.title}</div>
          <div className="mt-1 truncate text-[12.5px] text-ink-muted">
            {album.artistName}
            {album.year !== null && ` · ${album.year}`}
            {` · ${destination === "SHELF" ? t("pressingStep.toShelf") : t("pressingStep.toWishlist")}`}
          </div>
        </div>
        {/* The format question lives here rather than beside the search field: a record has
            no format at all until somebody says which copy of it they own. */}
        <div className="flex flex-none items-start gap-1.5">
          {FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => {
                const next = logic.stepFormat === format ? null : format;
                logic.chooseStepFormat(next);
                // A chosen pressing the new filter hides would otherwise stay selected
                // behind it, and the footer would name a row nobody can see.
                if (next !== null && logic.pressing?.format !== next) logic.choosePressing(null);
              }}
              aria-pressed={logic.stepFormat === format}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                logic.stepFormat === format
                  ? "bg-ink font-semibold text-surface"
                  : "border border-line bg-surface font-medium text-ink-muted"
              }`}
            >
              {FORMAT_LABELS[format]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 pt-4.5 pb-2">
        <PressingChoice
          selected={logic.pressing === null}
          onSelect={() => logic.choosePressing(null)}
          title={t("pressingStep.anyPressing")}
          detail={t("pressingStep.anyPressingHint")}
        />

        {pressings.isFetching ? null : pressings.isError ? (
          <p className="pt-5 text-[12.5px] text-ink-muted">{t("pressingStep.pressingsFailed")}</p>
        ) : rows.length === 0 ? (
          <p className="pt-5 text-[12.5px] text-ink-muted">
            {chosenFormat === null
              ? t("pressingStep.nonePressings")
              : t("pressingStep.noneOfThatFormat", { format: chosenFormat })}
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between pt-5 pb-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
                {t("pressingStep.orNameIt", { count: rows.length })}
              </span>
              <span className="text-[11.5px] text-ink-subtle">
                {t("pressingStep.sortedByYear")}
              </span>
            </div>
            {shown.map((release) => (
              <PressingRow
                key={release.id}
                release={release}
                selected={logic.pressing?.id === release.id}
                onSelect={() =>
                  logic.choosePressing(logic.pressing?.id === release.id ? null : release)
                }
              />
            ))}
            {!all && rows.length > shown.length && (
              <button
                type="button"
                onClick={() => setAll(true)}
                className="pt-3.5 pb-1 text-[12.5px] font-medium text-accent-strong"
              >
                {t("pressingStep.showAll", { count: rows.length })}
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex flex-none items-center justify-between gap-3.5 border-t border-line bg-white px-6 py-3.5">
        <span className="truncate text-[11.5px] text-ink-subtle">
          {t("pressingStep.addingAs", {
            summary: summary(logic, t("pressingStep.anyPressingSummary")),
          })}
        </span>
        <div className="flex flex-none items-center gap-2.5">
          <button
            type="button"
            onClick={logic.closePressingStep}
            className="text-[12.5px] font-medium text-ink-muted"
          >
            {t("pressingStep.cancel")}
          </button>
          <Button
            variant="primary"
            action="copy.add"
            onClick={() => void logic.commitPressingStep()}
            loading={logic.committingStep}
            className="h-9.5 rounded-full px-5 text-[13px]"
          >
            {!logic.committingStep && <Check size={15} strokeWidth={2.2} aria-hidden />}
            {destination === "SHELF"
              ? t("pressingStep.addToShelf")
              : t("pressingStep.addToWishlist")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The line that says what pressing the button will actually write. */
function summary(logic: Logic, anyPressing: string): string {
  const album = logic.step?.album;
  const parts = [album?.title ?? ""];
  if (logic.stepFormat !== null) parts.push(FORMAT_LABELS[logic.stepFormat].toLowerCase());
  parts.push(
    logic.pressing === null
      ? anyPressing
      : [logic.pressing.year, logic.pressing.country].filter((part) => part !== null).join(" · "),
  );
  return parts.filter((part) => part !== "").join(" · ");
}

/** "Any pressing" — a real row at the top of the list rather than a way out of it. */
function PressingChoice({
  selected,
  onSelect,
  title,
  detail,
}: {
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors ${
        selected ? "border-[1.5px] border-ink bg-white" : "border-[1.5px] border-line bg-surface"
      }`}
    >
      <Tick selected={selected} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-normal text-ink-muted">{detail}</span>
      </span>
    </button>
  );
}

function PressingRow({
  release,
  selected,
  onSelect,
}: {
  readonly release: Release;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  // Year and country identify a pressing at a glance; the label and catalogue number are
  // what you check it against when the sleeve is in your hand, so they sit on their own
  // line in mono rather than competing with it.
  const line = [release.year, release.country]
    .filter((part) => part !== null && String(part).trim() !== "")
    .join(" · ");
  const catalogue = [release.label, release.catalogNumber]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="flex w-full items-center gap-3.5 border-t border-line py-2.5 text-left"
    >
      {/* ReleaseArt, not FormatThumb: FormatThumb's `cover` is a ReactNode to layer over
          the paper, so handing it a URL string renders the URL as text. This is the
          component that turns a release into its sleeve, and every other row uses it. */}
      <div className="h-[50px] w-[60px] flex-none">
        <ReleaseArt release={release} />
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-snug">{line}</span>
        {catalogue !== "" && (
          <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-subtle">
            {catalogue}
          </span>
        )}
      </span>
      {selected && <Tick selected />}
    </button>
  );
}

function Tick({ selected }: { readonly selected: boolean }) {
  return (
    <span
      className={`flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full ${
        selected ? "bg-ink text-surface" : "border border-line"
      }`}
    >
      {selected && <Check size={12} strokeWidth={2.6} aria-hidden />}
    </span>
  );
}
