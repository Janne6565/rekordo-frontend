/**
 * Cloudflare's widget script, loaded once and only when a screen actually needs it.
 *
 * Not a `<script>` in index.html: three of the four screens that use it are ones most
 * people never open, and the sign-in page itself is not the first thing anybody sees. A
 * third-party script on every page load for a check that runs on four forms is a poor
 * trade -- and if the check is switched off server-side, this is never called at all.
 *
 * `render=explicit` because the widget has to be created with an action that depends on
 * which form it is standing in, and auto-rendering would claim the element first.
 */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export interface TurnstileRenderOptions {
  readonly sitekey: string;
  /** Echoed back by siteverify, which is how the server refuses a token from another form. */
  readonly action: string;
  readonly callback: (token: string) => void;
  readonly "expired-callback": () => void;
  readonly "error-callback": () => void;
  readonly theme?: "light" | "dark" | "auto";
  readonly size?: "normal" | "flexible" | "compact";
  readonly appearance?: "always" | "execute" | "interaction-only";
  readonly language?: string;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * One promise for the whole session, shared by every caller.
 *
 * Two forms mounted in the same session would otherwise each append a tag, and the second
 * script would re-register the global while the first widget was still using it.
 */
let loading: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile !== undefined) return Promise.resolve(window.turnstile);
  if (loading !== null) return loading;

  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // The script sets the global synchronously before onload, but a blocked or mangled
      // response can still fire onload having defined nothing -- which would otherwise
      // surface as a widget that silently never appears.
      if (window.turnstile === undefined) {
        // Cleared so a retry on the next mount is possible rather than permanently stuck
        // on this rejection.
        loading = null;
        reject(new Error("The verification script loaded without defining turnstile"));
        return;
      }
      resolve(window.turnstile);
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("The verification script could not be loaded"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
