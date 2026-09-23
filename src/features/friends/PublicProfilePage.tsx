import { Button } from "@/components/ui";
import { AppBanner } from "@/features/app/AppBanner";
import type { ProfileTab } from "@/features/friends/ProfilePage";
import { ProfileBody } from "@/features/friends/ProfilePage";
import { useProfileLogic } from "@/features/friends/useProfileLogic";
import { NotFoundFrame } from "@/features/notFound/NotFoundPage";
import { UnknownCollector } from "@/features/notFound/NotFoundState";
import { useNotFoundLogic } from "@/features/notFound/useNotFoundLogic";
import { OPERATOR, OPERATOR_ONE_LINE } from "@janne6565/rekordo-shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Screen 15i — the public link, opened by somebody with no account.
 *
 * The same body as the signed-in profile, in a page with no sidebar: there is no library
 * behind it to navigate back to, and the only two things a visitor can do here are look and
 * start a shelf of their own.
 */
export function PublicProfilePage({
  handle,
  tab,
  openId,
  onOpen,
}: {
  readonly handle: string;
  readonly tab: ProfileTab;
  readonly openId?: string;
  readonly onOpen: (id: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const logic = useProfileLogic(handle.replace(/^@/, ""));
  const navigate = useNavigate();
  const frame = useNotFoundLogic().frame;

  // 30f: nobody by that name. The same frame as the 404 rather than this page's own header
  // and banner, which would be offering a shelf that does not exist.
  if (logic.notFound) {
    return (
      <NotFoundFrame frame={frame}>
        <UnknownCollector handle={logic.handle} signedIn={logic.signedIn} />
      </NotFoundFrame>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <header className="flex flex-none items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-7 sm:py-3.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="flex-none font-serif text-[17px] leading-none">{t("app.name")}</span>
          {/* The address is the least of the three things in this row: it repeats what is
              in the address bar, so on a phone it gives way rather than pushing the way
              in off the right-hand edge. */}
          <span className="hidden truncate font-mono text-[11px] text-ink-subtle sm:block">
            {window.location.host}/@{logic.handle}
          </span>
        </div>
        <div className="flex flex-none items-center gap-3">
          {!logic.signedIn && (
            <>
              {/* Two ways to the same screen. Under 640px the quiet one goes: the button
                  beside it says the same thing with more of the offer in it. */}
              <Link
                to="/signin"
                className="hidden text-[12.5px] text-ink-muted no-underline hover:text-ink sm:block"
              >
                {t("public.signIn")}
              </Link>
              <Link to="/signin">
                <Button className="h-9 rounded-lg px-3.5 text-[12.5px]">
                  {t("public.startYourOwn")}
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {/*
       * 25b, variant two: a stranger who arrived from a shared link. The offer leads with
       * the shelf they do not have rather than with a product name they have not adopted.
       *
       * At the top here, unlike in the app's own shell. There it sits above the tab bar,
       * which is the bottom edge of the screen and always in view; this page has no tab
       * bar, so the same position put it under a whole shelf and the legal footer, where
       * nobody scrolled to it. The reader lands here, so the offer is here.
       */}
      <AppBanner context="SHARED" placement="TOP" />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <ProfileBody
          logic={logic}
          tab={tab}
          onTab={(next) =>
            void navigate(
              next === "wishlist"
                ? { to: "/$handle/wishlist", params: { handle } }
                : { to: "/$handle", params: { handle } },
            )
          }
          openId={openId}
          onOpen={onOpen}
        />
      </main>

      <PublicFooter />
    </div>
  );
}

/**
 * Screen 17j — the signed-out shell, where the legal row is the whole footer.
 *
 * A visitor with no account is the one person who cannot reach the sidebar's links, and is
 * also the one the Impressum obligation is actually about: § 5 DDG asks for it to be easily
 * recognisable and directly reachable from every page a stranger can land on.
 */
function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="mx-auto flex w-full max-w-5xl flex-none flex-wrap items-end justify-between gap-6 border-t border-line px-4 py-5 sm:gap-8 sm:px-7">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] font-medium">
          <FooterLink doc="impressum">{t("legal.impressum")}</FooterLink>
          <FooterLink doc="datenschutz">{t("legal.privacy")}</FooterLink>
          <FooterLink doc="nutzungsbedingungen">{t("legal.terms")}</FooterLink>
          <a
            href={`mailto:${OPERATOR.email}`}
            className="border-b border-ink/20 pb-px text-ink no-underline hover:border-ink/40"
          >
            {t("legal.contact")}
          </a>
        </div>
        <div className="text-[11.5px] text-ink-subtle">{OPERATOR_ONE_LINE}</div>
      </div>
      <div className="flex flex-none items-center gap-2 rounded-[9px] border border-line bg-surface px-3 py-2">
        <ShieldCheck size={14} strokeWidth={1.75} aria-hidden className="text-ink-subtle" />
        <span className="max-w-[190px] text-[11px] leading-[1.5] text-ink-muted">
          {t("legal.noCookiesHere")}
        </span>
      </div>
    </footer>
  );
}

function FooterLink({ doc, children }: { readonly doc: string; readonly children: ReactNode }) {
  return (
    <Link
      to="/legal/$doc"
      params={{ doc }}
      className="border-b border-ink/20 pb-px text-ink no-underline hover:border-ink/40"
    >
      {children}
    </Link>
  );
}
