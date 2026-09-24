import type { ProfileSummaryDto } from "@/api/generated/rekordoAPI.schemas";
import { Avatar } from "@/features/friends/Avatar";
import { RelationshipButton } from "@/features/friends/RelationshipButton";
import type { useFriendsLogic } from "@/features/friends/useFriendsLogic";
import { useFriendsSearchLogic } from "@/features/friends/useFriendsSearchLogic";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Lock, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

type Logic = ReturnType<typeof useFriendsLogic>;

/**
 * The desktop Friends header search (1a): the field, and its answer in a popover under it.
 *
 * The popover is positioned against the field and inserts nothing into the page, so the
 * feed below keeps its scroll position while somebody looks a handle up.
 */
export function FriendsSearch({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const search = useFriendsSearchLogic(logic);
  const expanded = search.view !== "closed";

  return (
    <div ref={search.root} className="relative w-72 flex-none">
      <Search
        size={14}
        strokeWidth={1.75}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
      <input
        ref={search.input}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={search.listId}
        aria-autocomplete="list"
        aria-activedescendant={
          search.view === "results" && search.activeIndex >= 0
            ? search.optionId(search.activeIndex)
            : undefined
        }
        value={search.query}
        onChange={search.change}
        onKeyDown={search.keyDown}
        onFocus={search.focus}
        placeholder={t("friends.searchPlaceholder")}
        aria-label={t("friends.searchPlaceholder")}
        className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-8 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-ink/25"
      />
      {search.query.length > 0 && (
        <button
          type="button"
          onClick={search.clear}
          aria-label={t("friends.search.clear")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
        >
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      )}

      {expanded && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-30 w-[380px] rounded-xl border border-ink/12 bg-surface p-1.5 shadow-[0_14px_36px_rgba(25,23,19,.14),0_2px_6px_rgba(25,23,19,.06)]">
          {search.view === "tooShort" && (
            <p className="px-1 py-1.5 text-[12.5px] text-ink-muted">
              {t("friends.signedOut.tooShort")}
            </p>
          )}
          {search.view === "noMatches" && (
            <p className="px-1 py-1.5 text-[12.5px] text-ink-muted">
              {t("friends.signedOut.noMatches")}
            </p>
          )}
          {(search.view === "results" || search.view === "searching") && (
            <div className="flex items-center justify-between gap-3 px-2.5 pt-1.5 pb-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                {search.count > 0
                  ? t("friends.search.results", { count: search.count })
                  : t("friends.results")}
              </span>
              <span className="flex items-center gap-2">
                {search.searching && (
                  <output className="flex items-center gap-1.5 font-mono text-[10px] text-ink-subtle">
                    <span
                      aria-hidden
                      className="h-[11px] w-[11px] flex-none animate-spin rounded-full border-[1.5px] border-ink/18 border-t-accent"
                    />
                    {t("friends.search.searching")}
                  </output>
                )}
                <kbd className="rounded border border-ink/15 px-[5px] py-px font-mono text-[10px] text-ink-subtle">
                  {t("friends.search.esc")}
                </kbd>
              </span>
            </div>
          )}
          {/* Always in the document while open, so aria-controls never points at nothing.
              Focus stays in the field (aria-activedescendant), so the list is never tabbed to. */}
          <div
            id={search.listId}
            // biome-ignore lint/a11y/useSemanticElements: a <select> cannot hold avatars and an Add button
            role="listbox"
            tabIndex={-1}
            aria-label={t("friends.results")}
          >
            {search.view === "results" &&
              search.results.map((person, index) => (
                <ResultRow
                  key={person.id ?? person.handle}
                  id={search.optionId(index)}
                  person={person}
                  active={index === search.activeIndex}
                  onHover={() => search.hover(index)}
                  logic={logic}
                />
              ))}
          </div>
          {search.view === "results" && (
            <div className="mt-1 border-t border-ink/9 px-2.5 pt-2 pb-1 font-mono text-[10px] text-ink-subtle">
              {t("friends.search.hint")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  id,
  person,
  active,
  onHover,
  logic,
}: {
  readonly id: string;
  readonly person: ProfileSummaryDto;
  readonly active: boolean;
  readonly onHover: () => void;
  readonly logic: Logic;
}) {
  const { t } = useTranslation();
  const name = person.displayName ?? person.handle ?? "";
  // Null rather than undefined when the shelf is closed, so `!= null` and not `!== undefined`.
  const sub = [
    person.handle ? `@${person.handle}` : "",
    person.copyCount != null ? t("friends.copies", { count: person.copyCount }) : "",
  ]
    .filter((part) => part.length > 0)
    .join(" · ");

  return (
    <div
      id={id}
      // biome-ignore lint/a11y/useSemanticElements: an <option> cannot hold a link and a button
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseEnter={onHover}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2.5 py-2",
        active ? "bg-paper" : "bg-transparent",
      )}
    >
      <Avatar name={name} src={person.avatarUrl} size={32} />
      <Link
        to="/friends/$handle"
        params={{ handle: person.handle ?? "" }}
        tabIndex={-1}
        className="min-w-0 flex-1 no-underline"
      >
        <div className="truncate text-[13px] font-semibold text-ink">{name}</div>
        <div className="flex items-center gap-1 truncate text-[11.5px] text-ink-muted">
          {person.collectionPrivate && <Lock size={11} strokeWidth={2} aria-hidden />}
          {sub}
        </div>
      </Link>
      <RelationshipButton person={person} logic={logic} />
    </div>
  );
}
