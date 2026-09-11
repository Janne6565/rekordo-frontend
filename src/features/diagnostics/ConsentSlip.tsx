import { Button } from "@/components/ui";
import { ConsentDetail } from "@/features/diagnostics/ConsentDetail";
import { ConsentLevelRow } from "@/features/diagnostics/ConsentLevelRow";
import { useConsentSlipLogic } from "@/features/diagnostics/useConsentSlipLogic";
import { cn } from "@/lib/utils";
import { DIAGNOSTICS_LEVELS, type DiagnosticsLevel } from "@/local/diagnosticsConsent";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

const LEVEL_KEY = {
  ANONYMOUS: "anonymous",
  FULL: "full",
  NOTHING: "nothing",
} as const satisfies Record<DiagnosticsLevel, string>;

const ACK = {
  ANONYMOUS: ["diagnostics.ack.anonymousTitle", "diagnostics.ack.anonymousBody"],
  FULL: ["diagnostics.ack.fullTitle", "diagnostics.ack.fullBody"],
  NOTHING: ["diagnostics.ack.nothingTitle", "diagnostics.ack.nothingBody"],
} as const satisfies Record<DiagnosticsLevel, readonly [string, string]>;

const TITLE_ID = "diagnostics-consent-title";

/**
 * The consent slip (design 2a) — a printed slip laid on the page, not a browser overlay.
 *
 * No scrim and no scroll lock, deliberately. A dim layer would make this a wall, and a
 * wall pushes people to click whichever button gets rid of it fastest, which is the
 * opposite of a free choice. It is noticeable by contrast, shadow and the terracotta rule.
 *
 * Shown to signed-out visitors too: the question is about this browser, and somebody who
 * has not made an account is exactly as entitled to be asked before anything is collected.
 */
export function ConsentSlip() {
  const { t } = useTranslation();
  const logic = useConsentSlipLogic();

  if (logic.stage === "HIDDEN") return null;

  const acknowledged = logic.stage === "ACKNOWLEDGED" && logic.saved !== null;

  return (
    <aside
      /*
       * An aside, not a dialog. `role="dialog"` would announce this as something that has
       * to be dealt with before the page can be used, which is exactly the wall the design
       * refuses to be: there is no scrim, no focus trap and no scroll lock, and the library
       * behind it stays readable. Calling it a dialog in the accessibility tree and not in
       * the layout would tell screen-reader users the opposite of what everyone else sees.
       */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-start p-4 pb-[calc(1rem+var(--spacing-safe))] sm:p-6 sm:pb-6"
      aria-label={t("diagnostics.title")}
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-[520px] overflow-hidden rounded-xl border border-line bg-paper shadow-[0_20px_44px_rgba(25,23,19,0.13),0_2px_6px_rgba(25,23,19,0.05)]",
          // A quarter-degree off true, so it reads as a slip that was set down rather than
          // a panel that was docked. Straightened when motion is reduced.
          "motion-safe:-rotate-[0.3deg]",
        )}
        data-testid="consent-slip"
      >
        <div className="h-[3px] bg-accent" />
        <div className="p-5 sm:p-6">
          {acknowledged ? (
            <Acknowledgement logic={logic} />
          ) : logic.stage === "DETAIL" ? (
            <ConsentDetail onBack={logic.closeDetail} />
          ) : (
            <Choice logic={logic} />
          )}
        </div>
      </div>
    </aside>
  );
}

type Logic = ReturnType<typeof useConsentSlipLogic>;

function Choice({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="font-mono text-[10px] tracking-[0.13em] text-ink-subtle uppercase">
        {t("diagnostics.eyebrow")}
      </div>
      <h2
        id={TITLE_ID}
        className="mt-2.5 font-serif text-[21px] leading-[1.2] text-pretty sm:text-[25px]"
      >
        {t("diagnostics.title")}
      </h2>
      <p className="mt-2 text-[13px] leading-[1.6] text-pretty text-ink-muted">
        {t("diagnostics.body")}
      </p>

      {/* Labelled by the heading rather than carrying an sr-only legend that repeats it:
          two copies of the same sentence is what a screen reader would actually read out. */}
      <fieldset aria-labelledby={TITLE_ID} className="mt-4 flex flex-col gap-2">
        {DIAGNOSTICS_LEVELS.map((level) => (
          <ConsentLevelRow
            key={level}
            level={level}
            name="diagnostics-level"
            selected={logic.picked === level}
            onSelect={logic.pick}
            title={t(`diagnostics.level.${LEVEL_KEY[level]}.title`)}
            body={t(`diagnostics.level.${LEVEL_KEY[level]}.body`)}
          />
        ))}
      </fieldset>

      <button
        type="button"
        onClick={logic.openDetail}
        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:text-accent-hover"
      >
        {t("diagnostics.detailLink")}
        <ChevronDown size={15} strokeWidth={2} aria-hidden />
      </button>

      <div className="mt-4">
        <Button onClick={logic.save} disabled={!logic.canSave} className="w-full">
          {t("diagnostics.save")}
        </Button>
        {!logic.canSave && (
          <p className="mt-2 text-center text-[11.5px] text-ink-subtle">
            {t("diagnostics.savePrompt")}
          </p>
        )}
      </div>

      <Footer />
    </>
  );
}

function Acknowledgement({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  // `saved` is non-null whenever this renders — ConsentSlip checks it before choosing this
  // branch, and the acknowledgement has nothing to say without it.
  const level = logic.saved as DiagnosticsLevel;
  const [titleKey, bodyKey] = ACK[level];
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{t(titleKey)}</div>
        <div className="mt-[3px] text-[11.5px] leading-[1.55] text-ink-muted">{t(bodyKey)}</div>
      </div>
      <Button variant="secondary" onClick={logic.undo} className="h-[34px] flex-none px-3.5">
        {t("diagnostics.ack.undo")}
      </Button>
    </div>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <div className="mt-3.5 flex items-center gap-2 border-t border-line pt-3">
      <span className="font-mono text-[10.5px] text-ink-subtle">{t("diagnostics.provider")}</span>
      <span className="font-mono text-[10.5px] text-ink-subtle">·</span>
      <Link
        to="/legal/$doc"
        params={{ doc: "datenschutz" }}
        className="font-mono text-[10.5px] text-accent hover:text-accent-hover"
      >
        {t("diagnostics.privacyPolicy")}
      </Link>
    </div>
  );
}
