import { AppShell } from "@/components/layout/AppShell";
import { LegalLinksRow } from "@/features/legal/LegalLinks";
import { useCollectionStats } from "@/features/library/useLibraryLogic";
import { NotFoundState, collectorsAction, homeAction } from "@/features/notFound/NotFoundState";
import type { NotFoundFrameKind } from "@/features/notFound/notFoundLogic";
import { useNotFoundLogic } from "@/features/notFound/useNotFoundLogic";
import { Link } from "@tanstack/react-router";
import { Disc3 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * The router's not-found page (30a to 30d): any path nothing answers to, and the public
 * link with the handle left off.
 */
export function NotFoundPage() {
  const { t } = useTranslation();
  const logic = useNotFoundLogic();
  const home = homeAction(logic.signedIn, t);
  const collectors = collectorsAction(t);

  return (
    <NotFoundFrame frame={logic.frame}>
      {logic.bareHandle ? (
        // 30d, third frame: no label on the sleeve and no chip, because the thing that is
        // missing is the name, and a bare `@` printed back says nothing.
        <NotFoundState
          mark="sleeve"
          eyebrow
          title={t("notFound.title")}
          body={t("notFound.bodyNoHandle")}
          actions={[collectors, home]}
        />
      ) : (
        <NotFoundState
          mark="sleeve"
          label="404"
          eyebrow
          title={t("notFound.title")}
          body={t("notFound.body")}
          path={{ host: logic.host, path: logic.path }}
          actions={[home, collectors]}
        />
      )}
    </NotFoundFrame>
  );
}

/**
 * The two contexts a dead end is drawn in.
 *
 * Signed in, it replaces the content area and the shell stays; no sidebar entry or tab is
 * lit, because none of them is where you are. Signed out, it stands alone with the brand,
 * a quiet way in and the legal row, so the page meets § 5 DDG on its own (30c).
 */
export function NotFoundFrame({
  frame,
  children,
}: {
  readonly frame: NotFoundFrameKind;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation();
  const stats = useCollectionStats();

  if (frame === "pending") return <div className="h-full bg-paper" />;

  if (frame === "shell") {
    return (
      <AppShell stats={stats}>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-7 py-10 sm:p-10">
          {children}
        </div>
      </AppShell>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <header className="flex h-[52px] flex-none items-center justify-between px-5 sm:h-[72px] sm:px-10">
        <div className="flex items-center gap-[9px] sm:gap-2.5">
          <Disc3 size={20} strokeWidth={1.6} aria-hidden />
          <span className="font-serif text-[17px] leading-none sm:text-[18px]">
            {t("app.name")}
          </span>
        </div>
        <Link
          to="/signin"
          className="flex h-11 items-center text-[13px] font-medium text-ink-muted no-underline hover:text-ink"
        >
          {t("public.signIn")}
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-7 py-8">{children}</main>
      <footer className="flex flex-none justify-center pt-3.5 pb-4 sm:h-16 sm:items-center sm:py-0">
        <LegalLinksRow tone="quiet" className="gap-4" />
      </footer>
    </div>
  );
}
