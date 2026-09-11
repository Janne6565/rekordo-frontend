import { Card, SectionTitle } from "@/components/rows";
import { ConsentDetail } from "@/features/diagnostics/ConsentDetail";
import { ConsentLevelRow } from "@/features/diagnostics/ConsentLevelRow";
import { useDiagnosticsSettingsLogic } from "@/features/diagnostics/useDiagnosticsSettingsLogic";
import { DIAGNOSTICS_LEVELS, type DiagnosticsLevel } from "@/local/diagnosticsConsent";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const LEVEL_KEY = {
  ANONYMOUS: "anonymous",
  FULL: "full",
  NOTHING: "nothing",
} as const satisfies Record<DiagnosticsLevel, string>;

const RECEIPT = {
  ANONYMOUS: "diagnostics.settings.receiptAnonymous",
  FULL: "diagnostics.settings.receiptFull",
  NOTHING: "diagnostics.settings.receiptNothing",
} as const satisfies Record<DiagnosticsLevel, string>;

const SETTINGS_TITLE_ID = "diagnostics-settings-title";

/**
 * The Privacy block in Settings (design 2d).
 *
 * Three resting states rather than a switch, matching the slip exactly — the same three
 * rows, in the same order, described the same way. Somebody who chose on the slip and then
 * comes here should recognise the decision, not have to re-derive which switch position
 * corresponds to the sentence they read a month ago.
 *
 * Withdrawal is the same gesture as consent: one tap on another row, no confirmation
 * dialog, no restating of the benefit, no plea.
 */
export function DiagnosticsSettings() {
  const { t, i18n } = useTranslation();
  const logic = useDiagnosticsSettingsLogic();

  const receipt =
    logic.level === null
      ? t("diagnostics.settings.receiptUnset")
      : t(RECEIPT[logic.level], {
          date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
            logic.decidedAt ?? Date.now(),
          ),
        });

  return (
    <>
      <SectionTitle>{t("diagnostics.settings.section")}</SectionTitle>
      <Card>
        <div className="border-b border-line px-4 py-3.5">
          <div id={SETTINGS_TITLE_ID} className="text-[13px] font-semibold">
            {t("diagnostics.settings.title")}
          </div>
          <div className="text-[11.5px] text-ink-muted">{t("diagnostics.settings.body")}</div>
          <fieldset aria-labelledby={SETTINGS_TITLE_ID} className="mt-3 flex flex-col gap-2">
            {DIAGNOSTICS_LEVELS.map((level) => (
              <ConsentLevelRow
                key={level}
                level={level}
                name="diagnostics-settings-level"
                selected={logic.level === level}
                onSelect={logic.choose}
                title={t(`diagnostics.level.${LEVEL_KEY[level]}.title`)}
                body={t(`diagnostics.level.${LEVEL_KEY[level]}.short`)}
              />
            ))}
          </fieldset>
        </div>

        <button
          type="button"
          onClick={logic.toggleDetail}
          aria-expanded={logic.detailOpen}
          className="flex w-full cursor-pointer items-center justify-between gap-3.5 border-b border-line px-4 py-3.5 text-left hover:bg-canvas"
        >
          <span className="text-[13px]">{t("diagnostics.detailLink")}</span>
          {logic.detailOpen ? (
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              className="flex-none text-ink-subtle"
              aria-hidden
            />
          ) : (
            <ChevronRight
              size={16}
              strokeWidth={1.75}
              className="flex-none text-ink-subtle"
              aria-hidden
            />
          )}
        </button>
        {logic.detailOpen && (
          <div className="border-b border-line bg-paper px-4 py-4">
            <ConsentDetail onBack={logic.toggleDetail} />
          </div>
        )}

        <Link
          to="/legal/$doc"
          params={{ doc: "datenschutz" }}
          className="flex items-center justify-between gap-3.5 px-4 py-3.5 hover:bg-canvas"
        >
          <span className="text-[13px] text-accent">{t("diagnostics.privacyPolicy")}</span>
          <ChevronRight
            size={16}
            strokeWidth={1.75}
            className="flex-none text-ink-subtle"
            aria-hidden
          />
        </Link>
      </Card>
      <p className="mt-2.5 px-1 text-[11px] leading-[1.6] text-pretty text-ink-subtle">{receipt}</p>
    </>
  );
}
