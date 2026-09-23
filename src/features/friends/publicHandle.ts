import { notFound } from "@tanstack/react-router";

/**
 * The guard on the public link, `/@somebody`.
 *
 * A bare dynamic segment at the root would swallow every unknown path, so the `@` is
 * required rather than merely conventional: without it a typo of `/wishlist` would render
 * a profile page for a collector called "wishlis". Static routes still win, and the server
 * keeps the app's own path segments off the handle register besides.
 *
 * Shared by the two public routes because they are one page with two tabs, and a guard
 * that held on only one of them would be a hole rather than an inconsistency.
 */
export function requirePublicHandle(handle: string): void {
  // A bare `@` (or one followed only by whitespace) names nobody. Let through, the page
  // would ask the API for `/profiles/` and dress Spring's static-resource 404 up as
  // "Nobody goes by @.".
  if (!handle.startsWith("@") || handle.slice(1).trim() === "") {
    throw notFound();
  }
}
