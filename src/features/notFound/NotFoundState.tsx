import { EmptySleeve } from "@/components/FormatThumb";
import { buttonClassName } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { Disc3, LibraryBig, type LucideIcon, Users } from "lucide-react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

/** One way out of a dead end. The first one a state is given is the primary button. */
export interface NotFoundAction {
  readonly to: "/" | "/friends";
  readonly label: string;
  readonly icon: LucideIcon;
  readonly viewTransition?: boolean;
  readonly onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

interface NotFoundStateProps {
  /** `sleeve` for an address or a handle nobody answers to, `slot` for an item that went. */
  readonly mark: "sleeve" | "slot";
  /** Written on the sleeve: what was asked for, or nothing when nothing was (30e). */
  readonly label?: string;
  /** The "404 · Not found" line. An item that went has no address worth numbering. */
  readonly eyebrow?: boolean;
  readonly title: string;
  readonly body: string;
  /** The address that missed, shown only for an unknown page (30a to 30d). */
  readonly path?: { readonly host: string; readonly path: string };
  readonly actions: readonly NotFoundAction[];
}

/**
 * Turn 30: the body of every dead end, in whatever frame it was reached from.
 *
 * One motif for all three misses, drawn at the library tile's 6:5: the empty sleeve for a
 * page or a collector, the bare slot for a copy that is gone. On a phone the actions stack
 * at full width so both clear 44px (30b); from 640px up they sit side by side.
 */
export function NotFoundState({
  mark,
  label,
  eyebrow = false,
  title,
  body,
  path,
  actions,
}: NotFoundStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full max-w-[440px] flex-col items-center text-center">
      <div className="h-[140px] w-[168px] sm:h-[180px] sm:w-[216px]">
        <EmptySleeve mode={mark} label={label} />
      </div>
      {eyebrow && (
        <div className="mt-7 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-subtle sm:mt-[34px] sm:text-[10.5px]">
          {t("notFound.eyebrow")}
        </div>
      )}
      <h1
        className={cn(
          "font-serif text-[26px] leading-[1.15] text-ink sm:text-[34px] sm:leading-[1.1]",
          eyebrow ? "mt-2.5 sm:mt-3" : "mt-7 sm:mt-[34px]",
        )}
      >
        {title}
      </h1>
      <p className="mt-2.5 text-[13.5px] leading-[1.6] text-pretty text-ink-muted sm:mt-3 sm:text-[14.5px] sm:leading-[1.65]">
        {body}
      </p>
      {path !== undefined && (
        <div className="mt-3.5 max-w-full truncate rounded-md bg-ink/5 px-2.5 py-1.5 font-mono text-[11.5px] font-medium text-ink-muted sm:mt-4 sm:text-[12px]">
          {/* The phone's address bar already shows the host, so the chip keeps only the
              part after it (30b). */}
          <span className="hidden sm:inline">{path.host}</span>
          {path.path}
        </div>
      )}
      <div className="mt-7 flex w-full flex-col gap-2.5 sm:mt-[30px] sm:w-auto sm:flex-row">
        {actions.map((action, index) => (
          <ActionLink key={action.label} action={action} primary={index === 0} />
        ))}
      </div>
    </div>
  );
}

function ActionLink({
  action,
  primary,
}: {
  readonly action: NotFoundAction;
  readonly primary: boolean;
}) {
  const Icon = action.icon;
  return (
    <Link
      to={action.to}
      viewTransition={action.viewTransition}
      onClick={action.onClick}
      className={buttonClassName(
        primary ? "primary" : "secondary",
        cn(
          "h-[46px] gap-[9px] whitespace-nowrap rounded-[9px] px-[18px] text-[14px] no-underline",
          !primary && "border-ink/40 bg-transparent hover:border-ink hover:bg-transparent",
        ),
      )}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        aria-hidden
        className={primary ? undefined : "text-ink-subtle"}
      />
      {action.label}
    </Link>
  );
}

/**
 * Home, which is a different place for the two readers: the library you have, or the
 * start page for somebody who has none here yet (30a against 30c).
 */
export function homeAction(signedIn: boolean, t: TFunction): NotFoundAction {
  return signedIn
    ? { to: "/", label: t("notFound.toLibrary"), icon: LibraryBig }
    : { to: "/", label: t("notFound.toStart"), icon: Disc3 };
}

/** Finding collectors works without an account, so both readers are offered it. */
export function collectorsAction(t: TFunction): NotFoundAction {
  return { to: "/friends", label: t("notFound.findCollectors"), icon: Users };
}

/**
 * 30f: `/@nobody`. The strings are the ones the profile always had; the state gains the
 * sleeve with the handle on it, and the search leads, since somebody looking for a person
 * is best served by it.
 */
export function UnknownCollector({
  handle,
  signedIn,
}: {
  readonly handle: string;
  readonly signedIn: boolean;
}) {
  const { t } = useTranslation();
  return (
    <NotFoundState
      mark="sleeve"
      label={`@${handle}`}
      eyebrow
      title={t("profile.notFound.title")}
      body={t("profile.notFound.body", { handle })}
      actions={[collectorsAction(t), homeAction(signedIn, t)]}
    />
  );
}
