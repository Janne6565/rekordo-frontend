import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Picking a record up and carrying it somewhere else — the web half of the gesture the
 * phone got first.
 *
 * One hook for both lists, because the shelf and the wishlist are the same gesture even
 * though one is a grid of sleeves and the other a column of rows. What each hands in is
 * geometry; what is shared is everything that decides how it behaves.
 *
 * ## What it does that the HTML5 drag it replaces did not
 *
 * The old wishlist used the browser's own `draggable`, which has no say in what anything
 * looks like: the row was replaced by the platform's drag image, the list did not move
 * under it, and where the row would land was never shown at all. It also needed a handle,
 * because `draggable` swallows text selection, and it had two states — armed and lifted —
 * because `dragstart` cannot wait for a press to finish. A press that never became a drag
 * left the row faded, since nothing had happened that could put it back down.
 *
 * This is pointer events end to end:
 *
 * - **The neighbours move.** Every other item slides into the slot it would occupy if you
 *   let go now, on a transition, and slides back if you carry on past it.
 * - **The carried item follows the pointer**, lifted and shadowed, drawn over the list.
 * - **Where it will land is the gap**, not a line between two rows.
 * - **A press that goes nowhere is not a drag.** Nothing happens until the pointer has
 *   moved past a threshold, so a click still opens the entry and a press that never moves
 *   ends in no state at all.
 * - **It works from anywhere on the row.** No handle, because nothing is being swallowed.
 *
 * ## Touch
 *
 * A touch that moves is the page scrolling, so on touch the carry waits for a hold —
 * `HOLD_MS`, the phone's own figure — before it will start, and the element carries
 * `touch-action: none` only once it has. A mouse has no such ambiguity and starts as soon
 * as it has moved far enough to mean it.
 */

/** One item's rectangle, in the list's own coordinates. */
export interface CarrySlot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The default lift: right for anything whose own outline is the thing being held. */
const CARD_LIFT: CSSProperties = { boxShadow: "0 14px 26px rgb(25 23 19 / 0.22)" };

/** How long after a carry a change to the list is still that carry's doing. */
const SETTLED_MS = 250;

/** How far a pointer moves before a press counts as a carry. */
const THRESHOLD_PX = 6;
/** How long a finger is held before it may carry rather than scroll. Matches the phone. */
const HOLD_MS = 220;

export interface Carry {
  /** Put this on every item, spread. */
  readonly itemProps: (index: number) => {
    readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
    readonly onDragStart: (event: React.DragEvent<HTMLElement>) => void;
    readonly ref: (element: HTMLElement | null) => void;
  };
  /** The index in the air, or null. */
  readonly carrying: number | null;
  /** Where it would land if you let go now, or null. */
  readonly landingAt: number | null;
  /** How far the carried item has been taken from its own slot, in pixels. */
  readonly offset: { readonly x: number; readonly y: number };
  /** What this item should be translated by right now, and whether it is the one in the air. */
  readonly styleFor: (index: number) => React.CSSProperties;
  /**
   * Whether what just happened to this list was a carry rather than something else.
   *
   * Asked by anything that would otherwise animate the change — the grid's settle, which
   * would put every tile back where it was and walk it forward again, over a rearrangement
   * the reader has just done with their own hand.
   */
  readonly carriedRecently: () => boolean;
}

export function useCarry({
  count,
  lift = CARD_LIFT,
  onDrop,
  enabled = true,
}: {
  readonly count: number;
  /**
   * What being in the air looks like, beyond following the pointer.
   *
   * The caller's business, because the shape of an item is. A wishlist row is a card, so a
   * shadow around it is a shadow around the thing you are holding; a shelf tile is artwork
   * with a title and a subtitle under it, and the same shadow outlines a rectangle that
   * includes the text — a phantom card around something that was never one.
   */
  readonly lift?: CSSProperties;
  /**
   * Where it ended up. Called once, and only when the position actually changed — a press
   * that goes nowhere is not a reorder and must not write anything.
   */
  readonly onDrop: (from: number, to: number) => void;
  /**
   * Whether anything may be picked up. False on a filtered list: a position in a narrowed
   * list means nothing in the whole one, so the gesture refuses rather than quietly
   * carrying somebody else's record.
   */
  readonly enabled?: boolean;
}): Carry {
  const elements = useRef<(HTMLElement | null)[]>([]);
  const slots = useRef<CarrySlot[]>([]);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef<number | null>(null);
  const allowed = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * When the last carry ended.
   *
   * A shelf tile is a link and a wishlist row opens a dialog, so the click that follows a
   * drop would carry the reader off to the record they had just finished moving. The
   * pointer sequence ends in a real `click`, and there is no flag on it that says a drag
   * happened — so the click immediately after a carry is swallowed.
   */
  const endedAt = useRef(0);
  /**
   * Where the record would land, kept beside the state that draws it.
   *
   * `pointerup` reads this rather than the state: the listener closes over whatever
   * `landingAt` was when the effect last ran, and a quick drag — press, one move, release
   * — releases before React has re-rendered with the first projection. Read from the
   * closure, that drop is silently thrown away.
   */
  const landingRef = useRef<number | null>(null);

  const [carrying, setCarrying] = useState<number | null>(null);
  const [landingAt, setLandingAt] = useState<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const ref = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      elements.current[index] = element;
    },
    [],
  );

  /**
   * Every item's rectangle, read once when the carry begins.
   *
   * Measured at that moment rather than kept up to date: the list does not change shape
   * while a record is being carried, and a `ResizeObserver` per row for a fact that is
   * read once is a cost paid on every render for nothing.
   */
  const measure = useCallback(() => {
    const first = elements.current.find((element) => element != null);
    if (first == null) return;
    const base = first.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    slots.current = elements.current.map((element) => {
      if (element == null) return { left: 0, top: 0, width: 0, height: 0 };
      const box = element.getBoundingClientRect();
      return {
        left: box.left - base.left,
        top: box.top - base.top,
        width: box.width,
        height: box.height,
      };
    });
  }, []);

  /**
   * The nearest slot to where the carried item is now.
   *
   * Nearest centre rather than counting the midpoints it has passed: a grid has two axes,
   * and one formula then serves both lists so they cannot drift apart. Exactly what the
   * phone does.
   */
  const project = useCallback((from: number, dx: number, dy: number): number => {
    const own = slots.current[from];
    if (own === undefined) return from;
    const centreX = own.left + own.width / 2 + dx;
    const centreY = own.top + own.height / 2 + dy;

    let best = from;
    let bestDistance = Number.POSITIVE_INFINITY;
    slots.current.forEach((slot, index) => {
      if (slot.width === 0) return;
      const distanceX = slot.left + slot.width / 2 - centreX;
      const distanceY = slot.top + slot.height / 2 - centreY;
      const distance = distanceX * distanceX + distanceY * distanceY;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }, []);

  const reset = useCallback(() => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    origin.current = null;
    held.current = null;
    allowed.current = false;
    landingRef.current = null;
    setCarrying(null);
    setLandingAt(null);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onPointerDown = useCallback(
    (index: number) => (event: React.PointerEvent<HTMLElement>) => {
      // Only the primary button, and never a press that began on a control — the button
      // that says "found it" is not a handle.
      //
      // Links are deliberately not in that list. A shelf tile *is* a link, and so is most
      // of a wishlist row, so refusing to carry one would refuse the whole grid; the click
      // that would otherwise follow the drop is swallowed instead.
      if (!enabled || count < 2 || event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button,input,textarea,select") !== null) return;

      origin.current = { x: event.clientX, y: event.clientY };
      held.current = index;
      if (event.pointerType === "mouse") {
        allowed.current = true;
        return;
      }
      // A finger that moves is the page scrolling until it has been held long enough to
      // mean something else.
      allowed.current = false;
      holdTimer.current = setTimeout(() => {
        allowed.current = true;
      }, HOLD_MS);
    },
    [enabled, count],
  );

  /**
   * The window listens for the whole life of the list, not only while something is held.
   *
   * The first version attached these only once a press was in progress — and gated that on
   * `held.current`, a ref. Setting a ref re-renders nothing, so the effect never re-ran and
   * the listeners were never attached at all: every press was a press, no press was ever a
   * carry. Attaching once costs a handler that returns on its first line when nothing is
   * held, which is the honest price for a gesture that begins outside React's knowledge.
   */
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const start = origin.current;
      const index = held.current;
      if (start === null || index === null) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;

      if (carrying === null) {
        if (!allowed.current) {
          // Moved before the hold was up: this was a scroll after all.
          if (Math.hypot(dx, dy) > THRESHOLD_PX) reset();
          return;
        }
        if (Math.hypot(dx, dy) <= THRESHOLD_PX) return;
        measure();
        setCarrying(index);
      }
      event.preventDefault();
      const landing = project(index, dx, dy);
      landingRef.current = landing;
      setOffset({ x: dx, y: dy });
      setLandingAt(landing);
    };

    const up = () => {
      const from = held.current;
      const to = landingRef.current;
      if (to !== null) endedAt.current = performance.now();
      reset();
      if (from !== null && to !== null && from !== to) onDrop(from, to);
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [carrying, measure, project, reset, onDrop]);

  const styleFor = useCallback(
    (index: number): React.CSSProperties => {
      if (carrying === null || landingAt === null) return {};
      if (index === carrying) {
        return {
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(1.03)`,
          // The carried item follows the pointer exactly — a transition here is lag.
          transition: "none",
          zIndex: 20,
          position: "relative",
          cursor: "grabbing",
          touchAction: "none",
          userSelect: "none",
          ...lift,
        };
      }

      // Where this item goes if the record is set down now: one step along, into the hole
      // it left behind.
      let moved = index;
      if (carrying < landingAt && index > carrying && index <= landingAt) moved = index - 1;
      else if (carrying > landingAt && index >= landingAt && index < carrying) moved = index + 1;

      const here = slots.current[index];
      const there = slots.current[moved];
      if (here === undefined || there === undefined) return {};
      return {
        transform: `translate3d(${there.left - here.left}px, ${there.top - here.top}px, 0)`,
        transition: "transform 180ms cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: "none",
      };
    },
    [carrying, landingAt, offset, lift],
  );

  /**
   * The browser's own drag, refused.
   *
   * Links and images are draggable by default, and a shelf tile is a link wrapped round an
   * image. Press one with a real mouse and the browser starts dragging *the link* — ghost
   * image, no-drop cursor — and cancels the pointer stream this hook is listening to, so
   * nothing could be carried at all. The wishlist never showed it, because its rows are
   * plain elements; the shelf was completely dead.
   *
   * Worth saying plainly: synthetic `PointerEvent`s do not start a native drag, so this
   * was invisible to every scripted check and only appeared under a real cursor.
   */
  const onDragStart = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const carriedRecently = useCallback(
    () => carrying !== null || performance.now() - endedAt.current < SETTLED_MS,
    [carrying],
  );

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (performance.now() - endedAt.current > SETTLED_MS) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return useMemo(
    () => ({
      itemProps: (index: number) => ({
        onPointerDown: onPointerDown(index),
        onClickCapture,
        onDragStart,
        ref: ref(index),
      }),
      carrying,
      landingAt,
      offset,
      styleFor,
      carriedRecently,
    }),
    [
      onPointerDown,
      onClickCapture,
      onDragStart,
      ref,
      carrying,
      landingAt,
      offset,
      styleFor,
      carriedRecently,
    ],
  );
}
