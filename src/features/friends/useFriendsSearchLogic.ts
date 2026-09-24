import type { ProfileSummaryDto } from "@/api/generated/rekordoAPI.schemas";
import { useNavigate } from "@tanstack/react-router";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/** The part of the Friends logic the header search reads. */
export interface FriendsSearchSource {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly results: readonly ProfileSummaryDto[];
  readonly searching: boolean;
  readonly queryTooShort: boolean;
  readonly searched: boolean;
}

/** What the popover under the field is showing, in the order the checks run. */
export type FriendsSearchView = "closed" | "tooShort" | "results" | "noMatches" | "searching";

/**
 * The desktop Friends header search and the popover that hangs off it.
 *
 * The answer used to land in a card at the top of the feed, which is off screen once the
 * feed has been scrolled. The popover puts it next to the field that was typed into and
 * leaves the feed where it was.
 *
 * Open whenever there is something typed, until Escape or a click outside dismisses it;
 * typing again (or focusing the field again) brings it back. Arrow keys wrap around the
 * list, and Enter opens the active person's shelf, the same place a click on the row goes.
 */
export function useFriendsSearchLogic(source: FriendsSearchSource) {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);

  const hasQuery = source.query.trim().length > 0;
  const open = hasQuery && !dismissed;
  const count = source.results.length;
  // Clamped on read rather than reset on every answer: a list that shrank under the
  // cursor keeps the cursor on its last row instead of pointing at nothing.
  const activeIndex = count === 0 ? -1 : Math.min(active, count - 1);

  let view: FriendsSearchView = "closed";
  if (open) {
    if (source.queryTooShort) view = "tooShort";
    else if (count > 0) view = "results";
    else if (source.searched && !source.searching) view = "noMatches";
    else view = "searching";
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setDismissed(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const { setQuery } = source;
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      setDismissed(false);
      setActive(0);
    },
    [setQuery],
  );

  const clear = useCallback(() => {
    setQuery("");
    setDismissed(false);
    setActive(0);
    input.current?.focus();
  }, [setQuery]);

  const openShelf = useCallback(
    (person: ProfileSummaryDto) => {
      if (!person.handle) return;
      setDismissed(true);
      void navigate({ to: "/friends/$handle", params: { handle: person.handle } });
    },
    [navigate],
  );

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "Escape":
        if (open) {
          event.preventDefault();
          setDismissed(true);
        }
        return;
      case "ArrowDown":
      case "ArrowUp": {
        if (!hasQuery) return;
        event.preventDefault();
        if (!open) {
          setDismissed(false);
          return;
        }
        if (count === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((activeIndex + step + count) % count);
        return;
      }
      case "Enter": {
        if (!open || activeIndex < 0) return;
        const person = source.results[activeIndex];
        if (person) {
          event.preventDefault();
          openShelf(person);
        }
        return;
      }
    }
  };

  return {
    root,
    input,
    listId,
    open,
    view,
    results: source.results,
    count,
    searching: source.searching,
    activeIndex,
    optionId: (index: number) => `${listId}-option-${index}`,
    query: source.query,
    change,
    clear,
    keyDown,
    /** Focusing a field that still holds a query brings its answer back. */
    focus: useCallback(() => setDismissed(false), []),
    hover: setActive,
    openShelf,
  };
}
