import { DURATION, MARK_HOLD, SETTLE_MAX_MOVES, cssEasing } from "@janne6565/rekordo-shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The web half of turn 13's motion set.
 *
 * The durations and easings themselves are in `styles.css` as custom properties, because
 * that is where transitions are declared; this file holds the three pieces that genuinely
 * need to run: the reduced-motion query, the Mark ring's lifetime, and the FLIP measure
 * that Settle cannot be expressed in CSS without.
 */

/**
 * Guards the values in `styles.css` against the shared package they were copied from.
 *
 * A stylesheet cannot import TypeScript, so the numbers exist twice. This is what stops
 * the copies from drifting the way everything else in this project did before it was
 * shared — it throws in development the moment they disagree.
 */
export function assertMotionTokensMatchStyles(): void {
  if (typeof window === "undefined") return;
  const styles = getComputedStyle(document.documentElement);
  const expected: Record<string, string> = {
    "--mc-quick": `${DURATION.quick}ms`,
    "--mc-base": `${DURATION.base}ms`,
    "--mc-slow": `${DURATION.slow}ms`,
    "--mc-enter": cssEasing("enter"),
    "--mc-exit": cssEasing("exit"),
    "--mc-move": cssEasing("move"),
  };
  for (const [name, want] of Object.entries(expected)) {
    const got = styles.getPropertyValue(name).trim().replaceAll(" ", "");
    if (got !== "" && got !== want.replaceAll(" ", "")) {
      throw new Error(`Motion token ${name} is ${got} in CSS but ${want} in the shared set`);
    }
  }
}

/**
 * Whether the reader has asked for less movement.
 *
 * CSS handles this on its own wherever a transition is declarative. This is for the two
 * places JavaScript decides: whether Settle measures at all, and whether a scroll is
 * smooth or instant.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** How long the ring is on screen in total: in at quick, hold, out at slow. */
const MARK_TOTAL = DURATION.quick + MARK_HOLD + DURATION.slow;

/**
 * The Mark ring: which record was just added, and for how long it says so.
 *
 * Deliberately not a toast. The ring says "it went here" in the place where the answer
 * lives, which a banner at the edge of the screen cannot do.
 */
export function useMark(): {
  marked: string | null;
  mark: (id: string) => void;
  clear: () => void;
} {
  const [marked, setMarked] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    setMarked(null);
  }, []);

  const mark = useCallback((id: string) => {
    window.clearTimeout(timer.current);
    setMarked(id);
    timer.current = window.setTimeout(() => setMarked(null), MARK_TOTAL);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { marked, mark, clear };
}

/**
 * Settle: the same tiles, in new places.
 *
 * FLIP, because there is no CSS that animates an element from where the previous layout
 * put it. Boxes are measured before the change (First), read again after it (Last), the
 * difference is applied as a transform on the frame the browser paints (Invert), and then
 * released so the transition carries each tile home (Play).
 *
 * Two things the deck is specific about. Items leaving the set are out of flow on the
 * first frame, so survivors move once rather than twice — that falls out of measuring
 * only the keys present in both passes. And past `SETTLE_MAX_MOVES` tiles the whole thing
 * is skipped in favour of a Cross: a hundred tiles flying at once is noise, not
 * continuity.
 *
 * @param container the element whose `[data-settle-key]` children move
 * @param dependency changes when the set has been reordered, filtered or re-sorted
 */
export function useSettle(
  container: React.RefObject<HTMLElement | null>,
  dependency: unknown,
  /**
   * Asked at the moment the set changes: was this change already shown?
   *
   * Settle is a FLIP — it puts every item back where it was and walks it forward. That is
   * right when an order changes out from under the reader, and wrong when they moved it
   * themselves: a drag has already carried the neighbours into their new places, so
   * putting them back is a jump to an arrangement nobody is looking at any more, and the
   * walk forward re-explains a move that was just watched. True here means measure and say
   * nothing.
   */
  alreadyShown?: () => boolean,
): void {
  const reduced = useReducedMotion();
  const previous = useRef<Map<string, DOMRect>>(new Map());
  const first = useRef(true);

  // `dependency` is the trigger rather than something the effect reads — the caller's way
  // of saying "the set has changed, measure again". Dropping it makes Settle run once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: explained above
  useLayoutEffect(() => {
    const root = container.current;
    if (root === null) return;

    const boxes = new Map<string, DOMRect>();
    for (const child of root.querySelectorAll<HTMLElement>("[data-settle-key]")) {
      const key = child.dataset.settleKey;
      if (key !== undefined) boxes.set(key, child.getBoundingClientRect());
    }

    const before = previous.current;
    previous.current = boxes;

    // The grid arrives drawn, with the shell. A staggered reveal here would be pure
    // theatre, and it is the first thing a returning user sees forty times a day.
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    if (alreadyShown?.() === true) return;

    const moves: { element: HTMLElement; dx: number; dy: number }[] = [];
    for (const child of root.querySelectorAll<HTMLElement>("[data-settle-key]")) {
      const key = child.dataset.settleKey;
      if (key === undefined) continue;
      const was = before.get(key);
      if (was === undefined) continue;
      const now = boxes.get(key);
      if (now === undefined) continue;
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      moves.push({ element: child, dx, dy });
    }

    if (moves.length === 0 || moves.length > SETTLE_MAX_MOVES) return;

    for (const { element, dx, dy } of moves) {
      element.style.transform = `translate(${dx}px, ${dy}px)`;
      element.style.transition = "none";
    }
    requestAnimationFrame(() => {
      for (const { element } of moves) {
        element.classList.add("mc-settling");
        element.style.transform = "";
        element.style.transition = "";
      }
      window.setTimeout(() => {
        for (const { element } of moves) element.classList.remove("mc-settling");
      }, DURATION.base);
    });
  }, [dependency, reduced, container, alreadyShown]);
}

/**
 * Tells the stylesheet that the swap about to happen is a return.
 *
 * The direction cannot be read off the router — both directions are ordinary navigations
 * — and it changes what the incoming pane does: forward it rises 6px and fades, back it
 * only fades, because the grid was never gone. The flag is cleared on the next frame after
 * the transition would have started, so it never leaks into an unrelated navigation.
 */
export function markBackNavigation(): void {
  document.documentElement.dataset.nav = "back";
  window.setTimeout(() => {
    delete document.documentElement.dataset.nav;
  }, DURATION.base + DURATION.quick);
}
