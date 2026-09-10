import type {
  FriendRequestDto,
  ProfileSummaryDto,
  SharingSettingsDtoCollectionVisibility,
} from "@/api/generated/rekordoAPI.schemas";
import { AppShell } from "@/components/layout/AppShell";
import { Button, PulsingDots } from "@/components/ui";
import { ActivityFeed } from "@/features/friends/ActivityFeed";
import { Avatar } from "@/features/friends/Avatar";
import { ClaimHandlePanel } from "@/features/friends/ClaimHandlePanel";
import { useFriendsLogic } from "@/features/friends/useFriendsLogic";
import { useCollectionStats } from "@/features/library/useLibraryLogic";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Lock, Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Screen 15g — activity in the main column, people in a rail, requests pinned.
 *
 * One page rather than two tabs, because on a wide screen there is room for both and the
 * two halves answer each other: a request card at the top of the feed is about somebody
 * who is not yet in the rail beside it.
 */
export function FriendsPage() {
  const { t } = useTranslation();
  const logic = useFriendsLogic();
  const stats = useCollectionStats();
  /** Which of 24g's two phone tabs was picked, or null while the default still holds. */
  const [tab, setTab] = useState<"ACTIVITY" | "FIND" | null>(null);

  if (!logic.signedIn) {
    return (
      <AppShell stats={stats}>
        <SignedOutFind logic={logic} />
      </AppShell>
    );
  }

  // Waiting rather than guessing: flashing the claim form at somebody who already has a
  // handle is worse than a moment of nothing.
  if (logic.needsHandle === undefined) {
    return (
      <AppShell stats={stats}>
        <div className="flex flex-1 items-center justify-center">
          <PulsingDots />
        </div>
      </AppShell>
    );
  }

  if (logic.needsHandle) {
    return (
      <AppShell stats={stats}>
        <div className="flex flex-1 items-start justify-center px-7 pt-16">
          <ClaimHandlePanel />
        </div>
      </AppShell>
    );
  }

  // Nothing to read means nothing to come back to, so a first visit opens on Find.
  const pane = tab ?? (logic.entries.length === 0 && !logic.loading ? "FIND" : "ACTIVITY");

  return (
    <AppShell stats={stats}>
      <header className="flex flex-none items-center justify-between gap-4 px-4 pt-5 pb-3.5 sm:px-7 sm:pt-6 sm:pb-4">
        <h1 className="font-serif text-2xl leading-none sm:text-[26px]">{t("friends.title")}</h1>
        {/* The search field is in the "Find" tab under 640px — see the tab strip below. */}
        <div className="hidden sm:block">
          <SearchField logic={logic} />
        </div>
      </header>

      {/*
       * 24g: the 256px rail cannot stand beside the feed at 390px, so the two become two
       * tabs. "Find" starts selected while there is nothing to read — suggestions are
       * useless during reading and are the whole screen on a first visit.
       */}
      <div className="flex flex-none gap-5 border-b border-line px-4 sm:hidden">
        {(["ACTIVITY", "FIND"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setTab(tab)}
            aria-current={pane === tab}
            className={cn(
              "h-11 text-[13px]",
              pane === tab
                ? "-mb-px border-b-2 border-ink font-semibold"
                : "font-medium text-ink-muted",
            )}
          >
            {t(tab === "ACTIVITY" ? "friends.tab.activity" : "friends.tab.find")}
            {tab === "FIND" && logic.incoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 font-mono text-[10px] text-paper">
                {logic.incoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-6 overflow-y-auto px-4 pb-8 sm:px-7">
        <main className={cn("min-w-0 flex-1", pane === "FIND" && "max-sm:hidden")}>
          {/*
           * Search results and pending requests belong to the pane that has the search
           * box and the badge counting them — which under 640px is Find, not this one.
           * Rendered here for the desktop, where both panes are on screen at once, and
           * in the aside for the phone. Never both: the wrappers are exclusive.
           */}
          <div className="max-sm:hidden">
            <FoundAndPending logic={logic} />
          </div>
          <ActivityFeed entries={logic.entries} loading={logic.loading} />
          <p className="mt-6 text-[11.5px] leading-relaxed text-ink-subtle">
            {t("friends.importsAreSilent")}
          </p>
        </main>

        <aside className={cn("w-full flex-none sm:w-64", pane === "ACTIVITY" && "max-sm:hidden")}>
          {/* The rail's own search box, which the header gives up under 640px. */}
          <div className="pt-4 pb-1 sm:hidden">
            <SearchField logic={logic} />
          </div>
          <div className="sm:hidden">
            <FoundAndPending logic={logic} />
          </div>
          <PeopleRail logic={logic} />
        </aside>
      </div>
    </AppShell>
  );
}

/**
 * What the search turned up, and who is waiting for an answer.
 *
 * One component because the two are the same kind of thing — people you have not decided
 * about yet — and because 24g's phone layout has to show both in its Find tab while the
 * desktop shows them above the feed.
 */
function FoundAndPending({ logic }: { readonly logic: Logic }) {
  return (
    <>
      {logic.results.length > 0 && <Results logic={logic} />}
      {logic.incoming.map((invite: FriendRequestDto) => (
        <RequestCard
          key={invite.id}
          name={invite.from?.displayName ?? invite.from?.handle ?? ""}
          avatarUrl={invite.from?.avatarUrl}
          handle={invite.from?.handle ?? ""}
          copies={invite.from?.copyCount}
          mutual={invite.mutualFriends ?? 0}
          onAccept={() => logic.acceptRequest.mutate(invite.id ?? "")}
          onDecline={() => logic.declineRequest.mutate(invite.id ?? "")}
          busy={logic.acceptRequest.isPending || logic.declineRequest.isPending}
        />
      ))}
    </>
  );
}

/**
 * What the Friends tab is for somebody with no account: the search, and nothing else.
 *
 * Looking a collector up is the one social thing that needs no account — a handle is
 * handed out precisely so it can be typed by somebody who has not signed up yet, and a
 * page that answers that with a login wall makes the link useless. Everything the search
 * leads to is already guest-safe: the profile behind a result draws the locked shelf or
 * the open one on the server's verdict, and offers sign-in in place of the Add button.
 *
 * The rest of the page stays behind the account, because it has nothing to show without
 * one — an empty feed, an empty rail and no requests are three ways of saying "sign in".
 */
function SignedOutFind({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const nothingFound = logic.searched && !logic.searching && logic.results.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-7 pb-8 sm:px-7">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-serif text-2xl leading-none sm:text-[26px]">
          {t("friends.signedOut.title")}
        </h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
          {t("friends.signedOut.body")}
        </p>

        <div className="mt-5">
          <SearchField logic={logic} full />
        </div>

        {logic.queryTooShort && (
          <p className="mt-2.5 text-[12px] text-ink-subtle">{t("friends.signedOut.tooShort")}</p>
        )}
        {nothingFound && (
          <p className="mt-2.5 text-[12px] text-ink-subtle">{t("friends.signedOut.noMatches")}</p>
        )}
        {logic.results.length > 0 && (
          <div className="mt-4">
            <Results logic={logic} />
          </div>
        )}

        {/* The offer, kept as a footnote rather than the screen: what a stranger came here
            to do is above it, and this is what they would gain by staying. */}
        <div className="mt-8 rounded-xl border border-line bg-surface px-4 py-3.5">
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            {t("friends.signedOut.invitation")}
          </p>
          <Link to="/signin" className="mt-3 inline-block no-underline">
            <Button className="h-9 rounded-lg px-4 text-[13px]">
              {t("friends.signedOut.action")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

type Logic = ReturnType<typeof useFriendsLogic>;

/** `full` is the signed-out pane, where the field is the page rather than a header slot. */
function SearchField({ logic, full }: { readonly logic: Logic; readonly full?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn("relative", full === true ? "w-full" : "w-72 flex-none")}>
      <Search
        size={14}
        strokeWidth={1.75}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
      <input
        value={logic.query}
        onChange={(event) => logic.setQuery(event.target.value)}
        placeholder={t("friends.searchPlaceholder")}
        aria-label={t("friends.searchPlaceholder")}
        className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-ink/25"
      />
    </div>
  );
}

function Results({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  return (
    <section className="mb-5 rounded-xl border border-line bg-surface p-1.5">
      <div className="px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
        {t("friends.results")}
      </div>
      {logic.results.map((person: ProfileSummaryDto) => (
        <PersonRow key={person.id} person={person} logic={logic} />
      ))}
    </section>
  );
}

function PersonRow({
  person,
  logic,
}: { readonly person: ProfileSummaryDto; readonly logic: Logic }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-(--mc-quick) hover:bg-paper">
      <Avatar name={person.displayName ?? person.handle ?? ""} src={person.avatarUrl} />
      <Link
        to="/friends/$handle"
        params={{ handle: person.handle ?? "" }}
        className="min-w-0 flex-1 no-underline"
      >
        <div className="truncate text-[13px] font-semibold text-ink">
          {person.displayName ?? person.handle}
        </div>
        <div className="flex items-center gap-1 truncate text-[11.5px] text-ink-muted">
          {person.collectionPrivate && <Lock size={11} strokeWidth={2} aria-hidden />}@
          {person.handle}
          {/* Null rather than undefined when the shelf is closed, and `!== undefined`
              rendered the bare word "copies" for every private collector. */}
          {person.copyCount != null && ` · ${t("friends.copies", { count: person.copyCount })}`}
        </div>
      </Link>
      <RelationshipButton person={person} logic={logic} />
    </div>
  );
}

/**
 * One button with four states, driven entirely by the server's verdict. The client never
 * works out the relationship for itself — it is a fact about two accounts, not about a
 * page.
 */
function RelationshipButton({
  person,
  logic,
}: { readonly person: ProfileSummaryDto; readonly logic: Logic }) {
  const { t } = useTranslation();
  const flat = "flex-none rounded-md px-2.5 py-1 text-[11.5px] font-medium";

  // A stranger gets no verdict to act on — the server answers the same for everybody when
  // nobody is asking — and the whole row already leads to the shelf, which is the only
  // thing they can do here. The invitation to sign in is under the list, said once.
  if (!logic.signedIn) {
    return null;
  }

  switch (person.relationship) {
    case "FRIENDS":
      return <span className={cn(flat, "text-ink-subtle")}>{t("friends.state.friends")}</span>;
    case "REQUEST_SENT":
      return <span className={cn(flat, "text-ink-subtle")}>{t("friends.state.requested")}</span>;
    case "SELF":
      return <span className={cn(flat, "text-ink-subtle")}>{t("friends.state.you")}</span>;
    default:
      return (
        <button
          type="button"
          onClick={() => logic.ask.mutate(person.handle ?? "")}
          disabled={logic.ask.isPending}
          className={cn(flat, "bg-ink text-paper disabled:opacity-50")}
        >
          {t("friends.state.add")}
        </button>
      );
  }
}

interface RequestCardProps {
  readonly name: string;
  readonly avatarUrl: string | null | undefined;
  readonly handle: string;
  readonly copies: number | null | undefined;
  readonly mutual: number;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
  readonly busy: boolean;
}

/** Pinned above the feed, because a person waiting for an answer outranks any record. */
function RequestCard({
  name,
  avatarUrl,
  handle,
  copies,
  mutual,
  onAccept,
  onDecline,
  busy,
}: RequestCardProps) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3">
      <Avatar name={name} src={avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">
          {t("friends.wantsToBeFriends", { name })}
        </div>
        <div className="truncate text-[11.5px] text-ink-muted">
          @{handle}
          {copies != null && ` · ${t("friends.copies", { count: copies })}`}
          {mutual > 0 && ` · ${t("friends.mutual", { count: mutual })}`}
        </div>
      </div>
      <button
        type="button"
        onClick={onDecline}
        disabled={busy}
        className="flex-none px-2 py-1 text-[12px] text-ink-muted disabled:opacity-50"
      >
        {t("friends.decline")}
      </button>
      <Button
        onClick={onAccept}
        disabled={busy}
        className="h-8 flex-none rounded-lg px-3 text-[12px]"
      >
        {t("friends.accept")}
      </Button>
    </div>
  );
}

function PeopleRail({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 flex flex-col gap-4">
      <section className="rounded-xl border border-line bg-surface p-1.5">
        <div className="px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
          {t("friends.people", { count: logic.friends.length })}
        </div>
        {logic.friends.length === 0 && (
          <p className="px-2.5 pb-2.5 text-[12px] leading-relaxed text-ink-muted">
            {t("friends.noneYet")}
          </p>
        )}
        {logic.friends.map((person: ProfileSummaryDto) => (
          <Link
            key={person.id}
            to="/friends/$handle"
            params={{ handle: person.handle ?? "" }}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 no-underline transition-colors duration-(--mc-quick) hover:bg-paper"
          >
            <Avatar
              name={person.displayName ?? person.handle ?? ""}
              src={person.avatarUrl}
              size={26}
            />
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-medium text-ink">
                {person.displayName ?? person.handle}
              </div>
              <div className="flex items-center gap-1 truncate text-[11px] text-ink-subtle">
                {person.collectionPrivate ? (
                  <>
                    <Lock size={10} strokeWidth={2} aria-hidden />
                    {t("friends.private")}
                  </>
                ) : (
                  t("friends.copies", { count: person.copyCount ?? 0 })
                )}
              </div>
            </div>
          </Link>
        ))}
      </section>

      {logic.outgoing.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-1.5">
          <div className="px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
            {t("friends.awaitingReply")}
          </div>
          {logic.outgoing.map((person: ProfileSummaryDto) => (
            <div key={person.id} className="flex items-center gap-2.5 px-2.5 py-1.5">
              <UserPlus size={13} strokeWidth={1.75} aria-hidden className="text-ink-subtle" />
              <span className="truncate text-[12px] text-ink-muted">@{person.handle}</span>
            </div>
          ))}
        </section>
      )}

      <ShelfSummary logic={logic} />
    </div>
  );
}

/**
 * Spelled out rather than assembled from the value: the translation keys are typed, and a
 * key built by lowercasing an enum is one the compiler cannot check.
 */
const SHELF_KEYS = {
  ONLY_ME: "friends.shelf.only_me",
  FRIENDS: "friends.shelf.friends",
  PUBLIC: "friends.shelf.public",
} as const satisfies Record<NonNullable<SharingSettingsDtoCollectionVisibility>, string>;

const SHELF_WISHLIST_KEYS = {
  ONLY_ME: "friends.shelf.wishlist.only_me",
  FRIENDS: "friends.shelf.wishlist.friends",
  PUBLIC: "friends.shelf.wishlist.public",
} as const satisfies Record<NonNullable<SharingSettingsDtoCollectionVisibility>, string>;

/** The "your shelf is open to friends" card — the settings said back to you in a sentence. */
function ShelfSummary({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const sharing = logic.sharing;
  if (!sharing) return null;

  return (
    <section className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="text-[12.5px] font-medium text-ink">
        {t(SHELF_KEYS[sharing.collectionVisibility ?? "FRIENDS"])}
      </div>
      <div className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
        {t(SHELF_WISHLIST_KEYS[sharing.wishlistVisibility ?? "FRIENDS"])}{" "}
        {sharing.pricesPublic ? t("friends.shelf.pricesShown") : t("friends.shelf.pricesHidden")}
      </div>
      <Link
        to="/account"
        className="mt-2 inline-block text-[11.5px] font-medium text-accent no-underline hover:underline"
      >
        {t("friends.changeSharing")}
      </Link>
    </section>
  );
}
