import { Button } from "@/components/ui";
import { ConsentDetail } from "@/features/diagnostics/ConsentDetail";
import { ConsentLevelRow } from "@/features/diagnostics/ConsentLevelRow";
import { useConsentSlipLogic } from "@/features/diagnostics/useConsentSlipLogic";
import { cn } from "@/lib/utils";
import {
  CONSENT_UNDO_HOLD,
  DIAGNOSTICS_LEVELS,
  type DiagnosticsLevel,
} from "@/local/diagnosticsConsent";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
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
          "pointer-events-auto w-full max-w-[524px] overflow-hidden rounded-xl border border-line bg-paper shadow-[0_20px_44px_rgba(25,23,19,0.13),0_2px_6px_rgba(25,23,19,0.05)]",
          // A quarter-degree off true, so it reads as a slip that was set down rather than
          // a panel that was docked. Straightened when motion is reduced.
          "motion-safe:-rotate-[0.3deg]",
        )}
        data-testid="consent-slip"
      >
        {/* On the acknowledgement the rule becomes the countdown: it runs out exactly when
            the slip closes itself, so the note does not look like it is staying for good.
            Keyed so a second Save after an Undo starts it from full again. */}
        <div
          key={acknowledged ? "countdown" : "rule"}
          className={cn("h-[3px] bg-accent", acknowledged && "mc-countdown")}
          style={acknowledged ? { animationDuration: `${CONSENT_UNDO_HOLD}ms` } : undefined}
          data-testid="consent-slip-rule"
        />
        <div className="px-[19px] pt-[17px] pb-4">
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
      <div className="font-mono text-[9.5px] tracking-[0.13em] text-ink-subtle uppercase">
        {t("diagnostics.eyebrow")}
      </div>
      <h2 id={TITLE_ID} className="mt-2 mb-[7px] font-serif text-[21px] leading-[1.2] text-pretty">
        {t("diagnostics.title")}
      </h2>
      <p className="text-[12.5px] leading-[1.6] text-pretty text-ink-muted">
        {t("diagnostics.body")}
      </p>

      {/* Labelled by the heading rather than carrying an sr-only legend that repeats it:
          two copies of the same sentence is what a screen reader would actually read out. */}
      <fieldset aria-labelledby={TITLE_ID} className="mt-3 flex flex-col gap-1.5">
        {DIAGNOSTICS_LEVELS.map((level) => (
          <ConsentLevelRow
            key={level}
            level={level}
            name="diagnostics-level"
            layout="inline"
            selected={logic.picked === level}
            onSelect={logic.pick}
            title={t(`diagnostics.level.${LEVEL_KEY[level]}.title`)}
            body={t(`diagnostics.level.${LEVEL_KEY[level]}.hint`)}
          />
        ))}
      </fieldset>

      {/* Compact rather than full-width, with the reason it is inert beside it: the hint
          explains the disabled state in the same glance, instead of under a bar-wide
          button that reads as the one thing to press. It stays outlined until a row is
          picked, so an unanswered slip has no filled button pulling at the eye. */}
      <div className="mt-[13px] flex items-center gap-3">
        <Button
          onClick={logic.save}
          disabled={!logic.canSave}
          variant={logic.canSave ? "primary" : "secondary"}
          className="h-10 flex-none px-[22px] text-[13px]"
        >
          {t("diagnostics.save")}
        </Button>
        {!logic.canSave && (
          <span className="text-[11.5px] text-ink-subtle">{t("diagnostics.savePrompt")}</span>
        )}
      </div>

      <Footer onDetail={logic.openDetail} />
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
    <div className="flex items-center gap-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{t(titleKey)}</div>
        <div className="mt-[3px] text-[11.5px] leading-[1.55] text-ink-muted">{t(bodyKey)}</div>
      </div>
      <Button variant="secondary" onClick={logic.undo} className="h-[34px] flex-none px-3.5">
        {t("diagnostics.ack.undo")}
      </Button>
      {/* Closes the slip and KEEPS the choice. It is not a second Undo: somebody who read
          the confirmation and wants it gone should not have to wait out the eight seconds,
          and closing a note that says "diagnostics are on" must not quietly turn them off. */}
      <button
        type="button"
        onClick={logic.dismiss}
        aria-label={t("diagnostics.ack.dismiss")}
        className="-mr-1 flex size-7 flex-none cursor-pointer items-center justify-center rounded-full text-ink-subtle transition-colors duration-(--mc-quick) hover:bg-canvas hover:text-ink"
        data-testid="consent-ack-dismiss"
      >
        <X size={17} strokeWidth={1.9} aria-hidden />
      </button>
    </div>
  );
}

/**
 * One mono line: what is collected, where it goes, and the policy. The detail link lives
 * here rather than above the button in the compact slip, so the choice and the Save sit
 * together and the fine print reads as fine print.
 */
function Footer({ onDetail }: { readonly onDetail: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-[7px] border-t border-line pt-[11px] font-mono text-[10px] uppercase">
      <button
        type="button"
        onClick={onDetail}
        className="cursor-pointer uppercase text-accent hover:text-accent-hover"
      >
        {t("diagnostics.detailLink")}
      </button>
      <span className="text-ink-subtle">·</span>
      <span className="text-ink-subtle">{t("diagnostics.provider")}</span>
      <span className="text-ink-subtle">·</span>
      <Link
        to="/legal/$doc"
        params={{ doc: "datenschutz" }}
        className="text-accent hover:text-accent-hover"
      >
        {t("diagnostics.privacyPolicy")}
      </Link>
    </div>
  );
}
