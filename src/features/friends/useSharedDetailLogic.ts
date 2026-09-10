import { type TouchEvent, useCallback, useEffect, useRef } from "react";

/**
 * How far a finger has to travel before it is a flip rather than a tap (23e).
 *
 * The dominant axis decides which gesture it was: sideways flips, downwards closes. A
 * short drag that cannot make up its mind does neither, which is what keeps a scroll
 * inside the sheet from throwing the record away.
 */
const SWIPE = 48;

export interface SharedDetail {
  /** Position of the open item in the shelf, or -1 when the sheet is closed. */
  readonly index: number;
  readonly open: boolean;
  readonly total: number;
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
  readonly prev: () => void;
  readonly next: () => void;
  readonly close: () => void;
  /** Spread onto the sheet: the phone flips by swiping, because it has no arrows. */
  readonly swipe: {
    readonly onTouchStart: (event: TouchEvent<HTMLElement>) => void;
    readonly onTouchEnd: (event: TouchEvent<HTMLElement>) => void;
  };
}

/**
 * Which record the detail sheet is showing, and how to get to the next one.
 *
 * The open item is an address rather than a piece of state: the sheet is the thing a
 * visitor is looking at when they decide to send the link on, and a modal that only
 * existed in memory could not be linked to, reloaded, or opened in a second tab. So the
 * id comes in from the route's search and every move out of here is a navigation.
 *
 * The arrows stop at the two ends instead of wrapping. Wrapping would make the last
 * record's "next" look like a shelf that never finishes.
 */
export function useSharedDetailLogic(
  // Null as well as undefined: the ids come straight off the wire, where a field the server
  // did not fill in arrives as an explicit null.
  ids: readonly (string | null | undefined)[],
  openId: string | undefined,
  onOpen: (id: string | undefined) => void,
): SharedDetail {
  // Read through a ref: the array is rebuilt on every render, and an effect that depended
  // on it would tear down its key listener between two identical shelves.
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const index = openId === undefined ? -1 : ids.findIndex((id) => id === openId);
  const open = index >= 0;

  const flip = useCallback(
    (step: number) => {
      if (index < 0) return;
      const target = idsRef.current[index + step];
      // An unnamed row is not something that can be addressed, so the shelf ends there.
      if (target == null || target === "") return;
      onOpen(target);
    },
    [index, onOpen],
  );

  const prev = useCallback(() => flip(-1), [flip]);
  const next = useCallback(() => flip(1), [flip]);
  const close = useCallback(() => onOpen(undefined), [onOpen]);

  /*
   * The arrow keys are the sheet's own, and Escape is not here on purpose: <dialog>
   * already delivers it as `cancel`, and a second listener would run the exit twice.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") flip(-1);
      else if (event.key === "ArrowRight") flip(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flip]);

  const from = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    from.current = touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      const start = from.current;
      const touch = event.changedTouches[0];
      from.current = null;
      if (start === null || touch === undefined) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) flip(dx < 0 ? 1 : -1);
      else if (dy > SWIPE && dy > Math.abs(dx)) close();
    },
    [flip, close],
  );

  return {
    index,
    open,
    total: ids.length,
    hasPrev: index > 0,
    hasNext: index >= 0 && index < ids.length - 1,
    prev,
    next,
    close,
    swipe: { onTouchStart, onTouchEnd },
  };
}
