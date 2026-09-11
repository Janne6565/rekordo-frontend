import { type DiagnosticsLevel, readDiagnosticsLevel } from "@/local/diagnosticsConsent";
import type { Faro, TransportItem } from "@grafana/faro-web-sdk";

/**
 * Frontend diagnostics, and the two shapes consent can take.
 *
 * Nothing here runs until somebody has answered the slip with ANONYMOUS or FULL. A browser
 * that answered NOTHING, or has not been asked, never loads a transport and never opens a
 * connection.
 *
 * THE LEVEL IS APPLIED AT SEND TIME, NOT AT INIT. That is the one structural decision in
 * this file and it is worth the paragraph. Faro fixes `sessionTracking` when it starts and
 * cannot be re-initialised in the same document, so a naive implementation makes a change
 * in Settings take effect only after a reload. Downgrading privacy settings on a delay is
 * exactly the wrong direction to fail in. So Faro is started once with session tracking
 * on, and `beforeSend` strips the session and user from every item while the stored level
 * is ANONYMOUS, and drops the item entirely while it is NOTHING. Both directions then take
 * effect on the next event rather than the next page load.
 *
 * THE SDK ITSELF IS LOADED LAZILY. Only the types are imported at the top; the ~100 KB of
 * Faro and its tracing instrumentation are fetched by `import()` at the moment somebody
 * consents. A reader who answers NOTHING never downloads it at all, which is the literal
 * reading of "nothing is collected until you say yes" rather than the convenient one.
 */

const COLLECTOR_URL = import.meta.env.VITE_FARO_COLLECTOR_URL as string | undefined;
const APP_NAME = (import.meta.env.VITE_FARO_APP_NAME as string | undefined) ?? "rekordo-web";
const APP_ENV = (import.meta.env.VITE_FARO_APP_ENV as string | undefined) ?? "prod";

let faro: Faro | null = null;
/** True while the SDK chunk is in flight, so two consents in a row cannot start it twice. */
let starting = false;
/** An account attached before the chunk landed, applied once it has. */
let pendingUserId: string | null = null;

/** A UUID anywhere in a path, e.g. /copies/2b7f…/tracks. */
const PATH_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Which record somebody was looking at is not needed to fix a crash, and at the anonymous
 * level it is the only thing in a URL that could single a person out across events.
 */
function scrubUrl(url: string): string {
  return url.replace(PATH_ID, ":id");
}

/**
 * Runs on every item Faro is about to send, and is the whole enforcement of the level.
 *
 * Reads the stored level rather than a captured variable on purpose: Settings writes
 * straight to `localStorage`, so an item in flight is judged by the answer that is true
 * now, not the one that was true when the page loaded.
 */
function applyLevel(item: TransportItem): TransportItem | null {
  const level = readDiagnosticsLevel();
  if (level !== "ANONYMOUS" && level !== "FULL") return null;
  if (level === "FULL") return item;

  // `session` and `user` are the two things that make an event attributable to a person,
  // and they are dropped by not carrying them over rather than by deleting them after.
  const { session: _session, user: _user, ...meta } = item.meta;
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
 * Idempotent, and safe to call on every level change. With no `VITE_FARO_COLLECTOR_URL`
 * the app behaves exactly as it did before diagnostics existed, which is what keeps local
 * development and any build that has not been given a collector silent.
 */
export function startDiagnostics(level: DiagnosticsLevel | null): void {
  if (level !== "ANONYMOUS" && level !== "FULL") return;
  if (faro !== null || starting) return;
  if (COLLECTOR_URL === undefined || COLLECTOR_URL === "") return;
  starting = true;
  void load();
}

async function load(): Promise<void> {
  const [{ getWebInstrumentations, initializeFaro }, { TracingInstrumentation }] =
    await Promise.all([import("@grafana/faro-web-sdk"), import("@grafana/faro-web-tracing")]);

  // Re-checked after the await: the network is slow enough that somebody can press Undo
  // between consenting and the chunk arriving, and starting then would be collecting
  // against an answer that has since been taken back.
  const level = readDiagnosticsLevel();
  if (level !== "ANONYMOUS" && level !== "FULL") {
    starting = false;
    return;
  }

  faro = initializeFaro({
    url: COLLECTOR_URL,
    app: { name: APP_NAME, environment: APP_ENV },
    // Kept on so FULL can link a journey; stripped per item by `applyLevel` while the
    // reader is on ANONYMOUS. Never persisted, so the identifier dies with the tab —
    // which is what the disclosure promises.
    sessionTracking: { enabled: true, persistent: false },
    instrumentations: [
      ...getWebInstrumentations({ captureConsole: false }),
      // Browser spans that continue into the backend trace. Only ever attributed to a
      // person at FULL, because `applyLevel` removes the session below that.
      new TracingInstrumentation(),
    ],
    beforeSend: applyLevel,
  });
  starting = false;
  if (pendingUserId !== null) setDiagnosticsUser(pendingUserId);
}

/**
 * Attach or detach the signed-in account.
 *
 * Only ever called with an id at FULL. Anonymous keeps no user, and `applyLevel` strips it
 * a second time on the way out, so a mistake here cannot leak an account id.
 */
export function setDiagnosticsUser(userId: string | null): void {
  pendingUserId = userId;
  if (faro === null) return;
  if (userId === null) faro.api.resetUser();
  else faro.api.setUser({ id: userId });
}

/** True once Faro is running, for the test that asserts NOTHING never starts it. */
export function diagnosticsRunning(): boolean {
  return faro !== null;
}
