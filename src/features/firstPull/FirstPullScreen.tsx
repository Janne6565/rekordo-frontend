import { AuthBrandPanel } from "@/features/auth/AuthBrandPanel";
import type { FirstPullStep, StepState } from "@/features/firstPull/lib";
import { useFirstPullLogic } from "@/features/firstPull/useFirstPullLogic";
import { cn } from "@/lib/utils";
import { Check, Disc3 } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Loading 1b: the sign-in composition held one beat longer, the form column replaced by
 * the parts of the first pull and where each has got to.
 */
export function FirstPullScreen() {
  const { t } = useTranslation();
  const { email, steps, percent } = useFirstPullLogic();

  return (
    <div className="flex min-h-full bg-paper">
      <AuthBrandPanel
        mode="SIGN_IN"
        footer={email === null ? undefined : t("firstPull.signedInAs", { email })}
      />
      <main className="flex flex-1 items-start justify-center px-4 pt-7 pb-10 sm:items-center sm:px-6 sm:py-10">
        <div className="w-full max-w-[380px]">
          {/* 24i: under 768px the brand panel is gone, so the wordmark carries it. */}
          <div className="mb-3 flex items-center gap-2 text-ink-muted md:hidden">
            <Disc3 size={17} strokeWidth={1.6} aria-hidden />
            <span className="font-serif text-[15px]">{t("app.name")}</span>
          </div>
          <h1 className="font-serif text-[26px] leading-[1.12] sm:text-[30px] sm:leading-[1.1]">
            {t("firstPull.title")}
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-muted">{t("firstPull.lede")}</p>
          {/* The native element speaks for the bar; the drawn one below is only its look. */}
          <progress
            className="sr-only"
            aria-label={t("firstPull.progressLabel")}
            max={100}
            value={percent}
          />
          <div aria-hidden className="mt-6.5 h-1 overflow-hidden rounded-xs bg-ink/9">
            <div
              className="h-full rounded-xs bg-accent transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
          <ul aria-live="polite" className="mt-5.5 flex flex-col">
            {steps.map((step) => (
              <StepRow key={step.key} step={step} />
            ))}
          </ul>
          <p className="mt-5.5 text-xs leading-[1.6] text-ink-subtle">{t("firstPull.footnote")}</p>
        </div>
      </main>
    </div>
  );
}

function StepRow({ step }: { readonly step: FirstPullStep }) {
  const { t } = useTranslation();
  const meta =
    step.state === "waiting"
      ? t("firstPull.queued")
      : step.count === null
        ? step.state === "busy"
          ? t("firstPull.fetching")
          : ""
        : step.state === "busy" && step.count === 0
          ? t("firstPull.fetching")
          : t("firstPull.items", { count: step.count });

  return (
    <li className="flex items-center gap-3 border-b border-ink/7 py-2.75">
      <StepMark state={step.state} />
      <span
        className={cn(
          "flex-1 text-[13.5px] font-medium",
          step.state === "waiting" ? "text-ink-subtle" : "text-ink",
        )}
      >
        {t(`firstPull.step.${step.key}` as const)}
      </span>
      <span className="font-mono text-[11px] text-ink-subtle">{meta}</span>
    </li>
  );
}

function StepMark({ state }: { readonly state: StepState }) {
  if (state === "done")
    return (
      <span className="flex size-5 flex-none items-center justify-center rounded-full bg-ink text-paper">
        <Check size={12} strokeWidth={2.6} aria-hidden />
      </span>
    );
  if (state === "busy")
    return (
      <span
        aria-hidden
        className="size-5 flex-none animate-spin rounded-full border-[1.8px] border-ink/14 border-t-accent motion-reduce:animate-none"
      />
    );
  return (
    <span
      aria-hidden
      className="size-5 flex-none rounded-full border-[1.5px] border-dashed border-ink/20"
    />
  );
}
