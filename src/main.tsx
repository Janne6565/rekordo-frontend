import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "@/i18n/config";
import "@/styles.css";
import { startDiagnostics } from "@/diagnostics/faro";
import { assertMotionTokensMatchStyles } from "@/lib/motion";
import { StoreProvider } from "@/local/StoreProvider";
import { readDiagnosticsLevel } from "@/local/diagnosticsConsent";
import { routeTree } from "@/routeTree.gen";
import { store } from "@/store";
import { SessionBootstrap } from "@/sync/SessionBootstrap";

// The motion values exist in two places — this app's stylesheet and the shared package —
// because a stylesheet cannot import TypeScript. In development, disagreeing about them is
// an error rather than something to notice months later in a screen recording.
if (import.meta.env.DEV) assertMotionTokensMatchStyles();

// Before React, so an error thrown during the first render is still caught. Reads the
// stored consent synchronously and does nothing at all if this browser has not answered,
// or answered NOTHING, or the build was given no collector URL.
startDiagnostics(readDiagnosticsLevel());

/**
 * `@` is left as itself in a path.
 *
 * It is a legal path character (RFC 3986 lists it under `pchar`), but the router percent-
 * encodes every param by default, which turned the public link into `/%40janne` the moment
 * it was navigated to rather than typed. The handle *is* the `@` here — it is what makes
 * the link recognisable as somebody's shelf and what the Sharing panel prints — so a link
 * that reads as an escape code in the address bar is the wrong link. No other param in the
 * app contains one, so nothing else changes shape.
 */
const router = createRouter({ routeTree, pathParamsAllowedCharacters: ["@"] });
const queryClient = new QueryClient();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("#root is missing from index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <StoreProvider>
          <SessionBootstrap>
            <RouterProvider router={router} />
          </SessionBootstrap>
        </StoreProvider>
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
);
