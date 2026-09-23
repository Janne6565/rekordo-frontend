import type { AuthStatus } from "@/store/authSlice";

/**
 * Which frame a dead end is drawn in (30a to 30d).
 *
 * `shell` is the signed-in app, sidebar and tab bar with nothing lit. `standalone` is the
 * signed-out page with the brand, a way in, and the legal row. `pending` is the moment
 * before the silent refresh has answered: showing a signed-out page to somebody who is
 * signed in is worse than showing nothing for a moment, as the auth slice says.
 */
export type NotFoundFrameKind = "pending" | "shell" | "standalone";

export function frameFor(status: AuthStatus): NotFoundFrameKind {
  if (status === "signedIn") return "shell";
  if (status === "anonymous") return "standalone";
  return "pending";
}

/**
 * The path as the chip prints it, with escapes read back into characters.
 *
 * The chip is there because a typo is the likeliest cause, and a typo is only visible in
 * the form somebody typed it.
 */
export function displayPath(pathname: string): string {
  try {
    return decodeURI(pathname);
  } catch {
    return pathname;
  }
}
