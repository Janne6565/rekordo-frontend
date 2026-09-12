/*
 * The bot check widget, for the phone's webview. See turnstile.html for why the page
 * exists at all.
 *
 * A separate file rather than an inline <script> so that the Content-Security-Policy can
 * say `script-src 'self' https://challenges.cloudflare.com` and mean it. Inline would have
 * needed 'unsafe-inline' -- which would hand the same permission to every other page on
 * this origin, including the one that renders user-uploaded images -- or a SHA-256 hash,
 * which silently stops matching the moment anybody edits this code. Neither is worth it
 * for a file that was always going to be static.
 */
(() => {
  /* Only the four the server knows. Anything else is refused here rather than sent to
     Cloudflare, so a stray query string cannot mint a token for an action that does not
     exist -- and cannot put arbitrary text into the widget's parameters. */
  const ACTIONS = ["register", "login", "forgot-password", "request-email-confirmation"];

  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  const language = params.get("lang") || "auto";

  function post(message) {
    /* The webview is the only consumer. Opened directly in a browser this is simply a
       blank page with a checkbox on it, which is harmless. */
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  }

  function fail(code) {
    post({ type: "error", code: code });
  }

  if (ACTIONS.indexOf(action) === -1) {
    fail("unknown-action");
    return;
  }

  let siteKey = null;
  let scriptReady = false;

  function drawWhenReady() {
    if (!scriptReady || siteKey === null) return;
    try {
      window.turnstile.render(document.getElementById("widget"), {
        sitekey: siteKey,
        action: action,
        language: language,
        theme: "light",
        size: "normal",
        callback: (token) => {
          post({ type: "token", token: token });
        },
        /* Five minutes is easily long enough for somebody to be interrupted mid-form,
           so an expired challenge is reported rather than left looking solved. */
        "expired-callback": () => {
          post({ type: "expired" });
        },
        /* The code is passed on deliberately. The first version of this swallowed it,
           and "the check could not be loaded" with no code behind it is a sentence
           nobody can act on -- 110200 (domain not allowed) and a network failure read
           identically. */
        "error-callback": (code) => {
          fail(code || "unknown");
          /* Returning true keeps the widget's own message off the screen; the app
             writes its own, in the reader's language. */
          return true;
        },
      });
    } catch (error) {
      fail("render-threw");
    }
  }

  /* The script is async, so it may not have defined turnstile yet. This is the hook it
     calls when it has, and the check below covers the race the other way. */
  window.onloadTurnstileCallback = () => {
    scriptReady = true;
    drawWhenReady();
  };
  if (window.turnstile !== undefined) window.onloadTurnstileCallback();

  /* Same origin, so this is just a fetch. A null site key means the server has the
     check switched off, in which case there is nothing to draw and nothing to say --
     the app is not showing this page at all in that case. */
  fetch("/api/v1/auth/challenge", { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then((config) => {
      if (!config || !config.siteKey) {
        fail("not-configured");
        return;
      }
      siteKey = config.siteKey;
      drawWhenReady();
    })
    .catch(() => {
      fail("config-unreachable");
    });

  /* A widget that never appears is the failure worth reporting: the phone may be on a
     network that cannot reach Cloudflare at all, and without this the sheet would sit
     with an empty box in it and nothing said. */
  window.setTimeout(() => {
    if (window.turnstile === undefined) fail("script-timeout");
  }, 15000);
})();
