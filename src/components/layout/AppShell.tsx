import { TabBar } from "@/components/layout/TabBar";
import { useSectionActive } from "@/components/layout/navActive";
import { AppBanner } from "@/features/app/AppBanner";
import { SidebarAccount } from "@/features/auth/SidebarAccount";
import { cn } from "@/lib/utils";
import type { CollectionStats } from "@janne6565/rekordo-shared";
import { Link } from "@tanstack/react-router";
import { Heart, LibraryBig, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface AppShellProps {
  readonly stats: CollectionStats | undefined;
  /**
   * What the phone gets at the bottom of the screen (24a).
   *
   * `tabs` is the four destinations. `none` is for the two kinds of screen that are a
   * level below them: the item detail, which puts its own Edit bar there, and the account
   * pages, which carry a back link at the top instead — five visible destinations with
   * none of them active is worse than none.
   *
   * Above 640px this changes nothing: the sidebar is always there.
   */
  readonly phoneBottom?: "tabs" | "none";
  readonly children: ReactNode;
}

/** The sidebar layout from screen 1f, shared by the library and the item detail. */
export function AppShell({ stats, phoneBottom = "tabs", children }: AppShellProps) {
  return (
    // h-full rather than h-screen: the height chain starts at <html> so that iOS Safari's
    // collapsing bar cannot resize the shell out from under a scroll position. See the
    // note on the chain in styles.css — under 640px no layout gets a viewport unit.
    <div className="flex h-full bg-paper text-ink">
      <Sidebar stats={stats} />
      <div className="flex min-w-0 flex-1 flex-col">
        {children}
        {/* 25b: above the tab bar, and only where the tab bar is. The levels that pass
            `none` are exactly the deck's never-list — the detail with its own bar, the
            account pages, and the legal documents a stranger opens from a shared link. */}
        {phoneBottom === "tabs" && <AppBanner />}
        {phoneBottom === "tabs" && <TabBar />}
      </div>
    </div>
  );
}

function Sidebar({ stats }: { readonly stats: CollectionStats | undefined }) {
  const { t } = useTranslation();
  return (
    /*
     * Outside the route transition. It is the same element on both routes, and a sidebar
     * that blinks when the pane beside it changes is the fastest way to make a cross-fade
     * look like a page load. Its own view-transition-name is what takes it out of the
     * root's group.
     *
     * Hidden rather than unmounted under 640px so that it stays the same element across a
     * resize, and so the phone tab bar is never a second copy of a live sidebar.
     */
    <nav className="mc-vt-sidebar hidden w-56 flex-none flex-col gap-6 border-r border-line p-4 pt-5 sm:flex">
      <div className="font-serif text-xl leading-none">{t("app.name")}</div>
      <div className="flex flex-col gap-0.5">
        <SidebarLink
          to="/"
          alsoActiveOn={["/copies"]}
          icon={<LibraryBig size={15} strokeWidth={1.75} aria-hidden />}
          count={stats?.copyCount}
        >
          {t("nav.library")}
        </SidebarLink>
        <SidebarLink to="/wishlist" icon={<Heart size={15} strokeWidth={1.75} aria-hidden />}>
          {t("nav.wishlist")}
        </SidebarLink>
        <SidebarLink to="/friends" icon={<Users size={15} strokeWidth={1.75} aria-hidden />}>
          {t("nav.friends")}
        </SidebarLink>
        {/* Artists and Settings from screen 1f are not built yet. A link to a route that
            does not exist is worse than no link, so they appear when they work. */}
      </div>
      {/* The legal links live in this block's menu since 19a — the sidebar used to end
          in two stacked footers, each with its own border and weight. */}
      <SidebarAccount copyCount={stats?.copyCount} />
    </nav>
  );
}

/** One class list, so the router's own match and ours cannot drift apart. */
const ACTIVE_LINK = "bg-surface text-ink font-semibold shadow-[0_1px_2px_rgba(25,23,19,.06)]";

interface SidebarLinkProps {
  readonly to: string;
  /** Sections that live outside this entry's own path — a record, opened from the shelf. */
  readonly alsoActiveOn?: readonly string[];
  readonly icon: ReactNode;
  readonly count?: number;
  readonly children: ReactNode;
}

function SidebarLink({ to, alsoActiveOn, icon, count, children }: SidebarLinkProps) {
  const active = useSectionActive(alsoActiveOn === undefined ? [] : [to, ...alsoActiveOn]);
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center justify-between rounded-md px-2.5 py-2 text-[13px] font-medium text-ink/65 transition-colors duration-(--mc-quick) hover:bg-surface",
        active && ACTIVE_LINK,
      )}
      activeProps={{ className: ACTIVE_LINK }}
      activeOptions={{ exact: to === "/" }}
    >
      <span className="flex items-center gap-2.5">
        {icon}
        {children}
      </span>
      {count !== undefined && (
        <span className="font-mono text-[11px] text-ink-subtle">{count}</span>
      )}
    </Link>
  );
}
