import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

const TONE = {
  /** In running text and on the sign-in screen, where the links are part of the offer. */
  accent: "border-b border-accent/35 font-semibold text-accent no-underline hover:border-accent",
  /** At the foot of a page that is about something else (30c): present, not competing. */
  quiet: "text-ink-subtle no-underline hover:text-ink",
} as const;

/**
 * A legal document link inside running text.
 *
 * Its children come from `<Trans>` when it is used inside a sentence, which is why they are
 * optional: the interpolated element carries the text, and only the standalone uses pass
 * their own.
 */
export function LegalTextLink({
  doc,
  tone = "accent",
  children,
}: {
  readonly doc: string;
  readonly tone?: keyof typeof TONE;
  readonly children?: ReactNode;
}) {
  return (
    <Link to="/legal/$doc" params={{ doc }} className={TONE[tone]}>
      {children}
    </Link>
  );
}

/**
 * The three links at the foot of screen 17a, and of every other page outside the shell.
 *
 * A page outside the app shell does not inherit the sidebar's legal menu, and § 5 DDG asks
 * for the Impressum to be directly reachable from every page a stranger can land on.
 */
export function LegalLinksRow({
  tone = "accent",
  className,
}: {
  readonly tone?: keyof typeof TONE;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex gap-3 text-[11px] text-ink-subtle", className)}>
      <LegalTextLink doc="impressum" tone={tone}>
        {t("legal.impressum")}
      </LegalTextLink>
      <LegalTextLink doc="datenschutz" tone={tone}>
        {t("legal.privacyShort")}
      </LegalTextLink>
      <LegalTextLink doc="nutzungsbedingungen" tone={tone}>
        {t("legal.termsShort")}
      </LegalTextLink>
    </div>
  );
}
