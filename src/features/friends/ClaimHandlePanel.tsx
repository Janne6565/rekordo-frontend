import type { HandleAvailabilityDtoReason } from "@/api/generated/rekordoAPI.schemas";
import { Button, FieldSpinner } from "@/components/ui";
import { useHandleClaimLogic } from "@/features/friends/useSharingLogic";
import { cn } from "@/lib/utils";
import { Check, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Screen 15e — shown once, the first time Friends is opened.
 *
 * Not part of signing up: the app is a collection tracker first, and an account that never
 * opens Friends never needs a handle at all. Which is also why nothing here blocks the rest
 * of the app — the panel is a page, not a modal, and the sidebar stays reachable behind it.
 */
/**
 * Spelled out rather than built from the reason at runtime: the translation keys are typed,
 * and a key assembled from a string is a key the compiler cannot check exists.
 */
const REASON_KEYS = {
  MALFORMED: "friends.claim.reason.malformed",
  TAKEN: "friends.claim.reason.taken",
  RESERVED: "friends.claim.reason.reserved",
  OK: "friends.claim.reason.ok",
} as const satisfies Record<NonNullable<HandleAvailabilityDtoReason>, string>;

export function ClaimHandlePanel() {
  const { t } = useTranslation();
  const logic = useHandleClaimLogic();
  const reason = logic.check?.available === false ? logic.check.reason : undefined;

  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Users size={19} strokeWidth={1.75} aria-hidden />
      </div>
      <h1 className="font-serif text-[22px] leading-tight text-ink">{t("friends.claim.title")}</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{t("friends.claim.body")}</p>

      <div
        className={cn(
          "mt-5 flex items-center gap-1 rounded-xl border bg-paper px-3.5 py-2.5 transition-colors duration-(--mc-quick)",
          reason ? "border-danger/40" : "border-line focus-within:border-ink/25",
        )}
      >
        <span className="text-[15px] text-ink-subtle">@</span>
        <input
          value={logic.value}
          onChange={(event) => logic.setValue(event.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label={t("friends.claim.label")}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none"
        />
        {logic.checking && <FieldSpinner />}
        {!logic.checking && logic.check?.available && (
          <Check size={17} strokeWidth={2.4} aria-hidden className="text-accent" />
        )}
      </div>

      <p
        className={cn(
          "mt-2 text-[11.5px] leading-relaxed",
          reason ? "text-danger" : "text-ink-muted",
        )}
      >
        {reason ? t(REASON_KEYS[reason]) : t("friends.claim.rules")}
      </p>

      <Button
        onClick={() => logic.claimIt.mutate()}
        disabled={!logic.canClaim}
        className="mt-5 h-10 w-full rounded-xl text-[13.5px]"
      >
        {t("friends.claim.action", { handle: logic.value.replace(/^@/, "") || "…" })}
      </Button>
    </div>
  );
}
