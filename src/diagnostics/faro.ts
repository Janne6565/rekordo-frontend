import { type DiagnosticsLevel, readDiagnosticsLevel } from "@/local/diagnosticsConsent";
import type { Faro, TransportItem } from "@grafana/faro-web-sdk";

/**
 * Frontend diagnostics, and the two shapes consent can take.
 *
 * Nothing here runs until somebody has answered the slip with ANONYMOUS or FULL. A browser
 * that answered NOTHING, or has not been asked, never downloads the SDK and never opens a
 * connection: only types are imported at the top, and the ~210 KB of Faro and its tracing
 * arrive by `import()` at the moment of consent. A build with no collector URL tree-shakes
 * them away entirely.
 *
 * THE MODE IS FIXED WHEN FARO STARTS, and the reason is a header. This collector refuses any
 * request without `x-faro-session-id`, and the transport fills that header from Faro's
 * *live* session meta — not from the item `beforeSend` receives. An earlier version started
 * one instance with session tracking on and stripped the session in `beforeSend` at
 * ANONYMOUS; the payload came out clean and the real per-tab ID went out in the header
 * anyway, on every request, against a disclosure promising no session identifier.
 *
 * So the two levels are two genuinely different configurations:
 *
 *   ANONYMOUS  session tracking off, and the session set to the constant `anonymous`. The
 *              collector gets the header it demands, but every anonymous browser sends the
 *              same value, so it distinguishes nobody. No tracing instrumentation, because
 *              linking a click to its backend trace is listed as something only Full adds.
 *   FULL       a random per-tab session, never persisted, plus browser-to-backend traces.
 *
 * Faro cannot be re-initialised in the same document, so a change of level after it has
 * started is resolved in the safe direction only:
 *
 *   down (FULL to ANONYMOUS, or anything to NOTHING)  paused at once, until the next load
 *   up   (ANONYMOUS to FULL)                           keeps sending anonymously until the
 *                                                     next load, which under-collects
 *
 * It never sends more than the reader currently allows, and never later than the moment
 * they took it back.
 */

const COLLECTOR_URL = import.meta.env.VITE_FARO_COLLECTOR_URL as string | undefined;
// Matches the app as named in Grafana, which the collector relabels every item with anyway.
const APP_NAME = "Rekordo";

/** What Faro's UserActionInstrumentation names the event for a completed action. */
const USER_ACTION_EVENT = "faro.user.action";

/** The session every anonymous browser shares. A label, not an identifier. */
const ANONYMOUS_SESSION_ID = "anonymous";

const RANK = { NOTHING: 0, ANONYMOUS: 1, FULL: 2 } as const satisfies Record<
  DiagnosticsLevel,
  number
>;

/**
 * Staging and prod are built from the same Dockerfile with the same build args, so the
 * environment cannot be baked in — it would say "prod" on staging. The host says it.
 */
function environment(): string {
  return globalThis.location?.hostname.includes("-staging.") === true ? "staging" : "prod";
}

let faro: Faro | null = null;
/** Which level the running instance was configured for. Fixed for the life of the page. */
let startedAs: "ANONYMOUS" | "FULL" | null = null;
/** True while the SDK chunk is in flight, so two consents in a row cannot start it twice. */
let starting = false;
/** An account handed over before the chunk landed, applied once it has. */
let pendingUserId: string | null = null;

/** A UUID anywhere in a path, e.g. /copies/2b7f…/tracks. */
const PATH_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Which record somebody was looking at is not needed to fix a crash, and at the anonymous
 * level it is the one thing left in a URL that could tell two people apart.
 */
function scrubUrl(url: string): string {
  return url.replace(PATH_ID, ":id");
}

/**
 * The last line of enforcement, on every item.
 *
 * `pause()` is what stops a downgraded instance; this is belt and braces behind it, and it
 * reads the stored level fresh rather than a captured one so an item already queued is
 * judged by the answer that is true now. At ANONYMOUS it also strips any user and record id
 * that got into the payload by some other path.
 */
export function applyLevel(item: TransportItem): TransportItem | null {
  const level = readDiagnosticsLevel();
  if (level === null || startedAs === null || RANK[level] < RANK[startedAs]) return null;
  if (startedAs === "FULL") return item;

  // Anonymous mode loads neither tracing nor user actions, so a trace or a user-action
  // event arriving here came some other way, and is dropped rather than trusted.
  if (item.type === "trace") return null;
  if (item.type === "event" && (item.payload as { name?: string }).name === USER_ACTION_EVENT) {
    return null;
  }
  const { user: _user, ...meta } = item.meta;
  return {
    ...item,
    meta:
      meta.page?.url === undefined
        ? meta
        : { ...meta, page: { ...meta.page, url: scrubUrl(meta.page.url) } },
  };
}

/**
 * Start collecting, if this browser has consented and the build knows where to send.
 *
 * Also the place a change of level lands: once running, it pauses or resumes the instance
 * rather than starting another one.
 */
export function startDiagnostics(level: DiagnosticsLevel | null): void {
  if (faro !== null && startedAs !== null) {
    const allowed = level !== null && RANK[level] >= RANK[startedAs];
    if (allowed) faro.unpause();
    else faro.pause();
    return;
  }
  if (level !== "ANONYMOUS" && level !== "FULL") return;
  if (starting) return;
  if (COLLECTOR_URL === undefined || COLLECTOR_URL === "") return;
  starting = true;
  void load(COLLECTOR_URL);
}

async function load(url: string): Promise<void> {
  const [
    { getWebInstrumentations, initializeFaro, UserActionInstrumentation },
    { TracingInstrumentation },
  ] = await Promise.all([import("@grafana/faro-web-sdk"), import("@grafana/faro-web-tracing")]);

  // Re-read after the await: somebody can press Undo, or change their mind in Settings,
  // between consenting and the chunk arriving. Whatever is true now is what starts.
  const level = readDiagnosticsLevel();
  starting = false;
  if (level !== "ANONYMOUS" && level !== "FULL") return;

  const full = level === "FULL";
  startedAs = level;
  faro = initializeFaro({
    url,
    app: { name: APP_NAME, environment: environment() },
    sessionTracking: full ? { enabled: true, persistent: false } : { enabled: false },
    instrumentations: [
      // `getWebInstrumentations` always includes user actions and has no option to leave
      // them out, so at ANONYMOUS they are filtered by type. Which buttons somebody presses
      // is not an error or a timing, and "an action you took in the browser" is listed as
      // something only Full collects.
      ...getWebInstrumentations({ captureConsole: false }).filter(
        (instrumentation) => full || !(instrumentation instanceof UserActionInstrumentation),
      ),
      ...(full ? [new TracingInstrumentation()] : []),
    ],
    ignoreErrors: [
      // Layout quirks and cross-origin noise: harmless, and they would drown real errors.
      /^ResizeObserver loop limit exceeded$/,
      /^ResizeObserver loop completed with undelivered notifications$/,
      /^Script error\.$/,
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],
    ignoreUrls: [
      // Faro's own sends. They go to this origin now, through the nginx proxy, so without
      // this the fetch instrumentation times every delivery and the tracing instrumentation
      // stamps a traceparent on it: diagnostics reporting on the act of reporting.
      /\/faro\/collect/,
      // Cloudflare Turnstile loads and polls from its own origin on the auth screens. Its
      // requests are the challenge working, not the app misbehaving.
      /challenges\.cloudflare\.com/,
    ],
    beforeSend: applyLevel,
  });

  if (!full) faro.api.setSession({ id: ANONYMOUS_SESSION_ID });
  else if (pendingUserId !== null) faro.api.setUser({ id: pendingUserId });
}

/**
 * Attach or detach the signed-in account. A no-op unless the instance is running as FULL,
 * so an anonymous instance can never be handed an account id, whatever the caller does.
 */
export function setDiagnosticsUser(userId: string | null): void {
  pendingUserId = userId;
  if (faro === null || startedAs !== "FULL") return;
  if (userId === null) faro.api.resetUser();
  else faro.api.setUser({ id: userId });
}

/** For tests: which mode the running instance was started in, if any. */
export function diagnosticsMode(): "ANONYMOUS" | "FULL" | null {
  return startedAs;
}
