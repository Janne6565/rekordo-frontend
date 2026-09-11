/**
 * What this browser has agreed Rekordo may send when it breaks.
 *
 * Three answers rather than a switch, because "anonymous only" is a real position and not
 * a reduced version of the full one: it collects errors and timings with no identifier at
 * all, so two crashes from the same person cannot be joined up. Presenting it as a
 * middle setting on an on/off control would make it read as a hedge.
 *
 * `localStorage`, not the Dexie store the other device preferences live in, for one
 * reason: this has to be readable *synchronously*, before React mounts, so diagnostics can
 * start early enough to catch the errors that happen during boot. Every reader of the
 * local store is async and runs after `StoreProvider` has opened the database, which is
 * already too late. It follows the same shape as the language preference, which persists
 * to `localStorage` for the same class of reason.
 *
 * Deliberately per-browser and never synced. Consent is given by a person sitting at a
 * particular device; carrying it to a second browser over sync would be assuming the
 * answer somewhere it was never asked.
 */

const STORAGE_KEY = "music-collector-diagnostics-consent";

/**
 * `null` is not a fourth level — it is the absence of an answer, which is what makes the
 * slip appear. "NOTHING" is an answer, and a decision not to ask again.
 */
export type DiagnosticsLevel = "ANONYMOUS" | "FULL" | "NOTHING";

/**
 * The answer and when it was given.
 *
 * Stored as one JSON value rather than two keys so a level can never be read back without
 * its date: Settings shows "Anonymous only since 11 Sep 2026" as the receipt, and a
 * receipt with a missing date is worse than no receipt.
 */
export interface DiagnosticsDecision {
  readonly level: DiagnosticsLevel;
  /** Epoch millis. */
  readonly at: number;
}

export const DIAGNOSTICS_LEVELS: readonly DiagnosticsLevel[] = ["ANONYMOUS", "FULL", "NOTHING"];

/** How long the choice can still be taken back, per the acknowledgement in the design. */
export const CONSENT_UNDO_HOLD = 8_000;

function isLevel(value: string): value is DiagnosticsLevel {
  return (DIAGNOSTICS_LEVELS as readonly string[]).includes(value);
}

/**
 * The stored answer, or `null` if this browser has never been asked.
 *
 * Guarded through `globalThis` because it is called at module scope: a test environment or
 * an SSR pass has no `localStorage`, and an unasked browser is the right answer there.
 * A stored value that is not a level (hand-edited, or written by an older build) is
 * treated as unanswered rather than coerced, so nobody is opted in by a typo.
 */
export function readDiagnosticsDecision(): DiagnosticsDecision | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored === null || stored === undefined) return null;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { level, at } = parsed as Record<string, unknown>;
    if (typeof level !== "string" || !isLevel(level)) return null;
    return { level, at: typeof at === "number" ? at : 0 };
  } catch {
    // Safari in private mode throws on access rather than returning null, and a
    // half-written value throws in JSON.parse. Both mean "not answered", which is the
    // only safe reading: nobody gets opted in by a corrupt string.
    return null;
  }
}

/** The hot path — `beforeSend` calls this on every item, so it stays a single read. */
export function readDiagnosticsLevel(): DiagnosticsLevel | null {
  return readDiagnosticsDecision()?.level ?? null;
}

export function writeDiagnosticsLevel(level: DiagnosticsLevel, at: number = Date.now()): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ level, at }));
  } catch {
    // Nothing to do: the choice still applies to this session, it just will not survive a
    // reload. Refusing to honour it because it cannot be written down would be worse.
  }
}

/** Used by Undo, which has to return the browser to genuinely unanswered. */
export function clearDiagnosticsLevel(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // See above.
  }
}
