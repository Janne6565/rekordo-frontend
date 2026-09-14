// The page is mostly translated strings, so the real bundle is what it is rendered with.
import "@/i18n/config";
import { SignInPage } from "@/features/auth/SignInPage";
import type { useAuthLogic } from "@/features/auth/useAuthLogic";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ logic: vi.fn(), navigate: vi.fn(), search: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { readonly children: ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => mocked.navigate,
  useSearch: () => mocked.search(),
}));
vi.mock("@/features/auth/useAuthLogic", () => ({ useAuthLogic: mocked.logic }));

type Auth = { status: string; firstSyncPending: boolean };

/**
 * The bot check as this page sees it. Off by default, which is how it looks against a
 * server with no keys configured: nothing drawn, nothing to solve, nothing gated.
 */
function challenge(overrides: Record<string, unknown> = {}) {
  return {
    container: vi.fn(),
    action: "login",
    required: false,
    satisfied: true,
    token: null,
    reset: vi.fn(),
    failed: false,
    ...overrides,
  };
}

function page(
  auth: Auth,
  search: Record<string, unknown> = {},
  logic: Record<string, unknown> = {},
) {
  mocked.search.mockReturnValue(search);
  mocked.logic.mockReturnValue({
    auth: { ...auth, user: null },
    mode: "SIGN_IN",
    setMode: vi.fn(),
    email: "",
    setEmail: vi.fn(),
    password: "",
    setPassword: vi.fn(),
    displayName: "",
    setDisplayName: vi.fn(),
    rememberMe: true,
    setRememberMe: vi.fn(),
    consented: false,
    setConsented: vi.fn(),
    availableProviders: [],
    challenge: challenge(),
    canSubmit: false,
    submit: vi.fn(),
    submitting: false,
    failed: [],
    signOut: vi.fn(),
    signingOut: false,
    ...logic,
  } as unknown as ReturnType<typeof useAuthLogic>);
  render(<SignInPage />);
}

describe("the sign-in page when there is nothing to sign in to", () => {
  beforeEach(() => {
    mocked.navigate.mockClear();
  });

  it("hands a signed-in visitor their shelf instead of the form", () => {
    page({ status: "signedIn", firstSyncPending: false });

    expect(mocked.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("waits for the session to be restored rather than acting on 'not anonymous'", () => {
    // The refresh cookie is exchanged after the first paint; until it is, nobody is known.
    page({ status: "unknown", firstSyncPending: false });

    expect(mocked.navigate).not.toHaveBeenCalled();
  });

  it("sends a pending first sync to the library, which is where it is now asked", () => {
    // 29: the conflict dialogue is mounted above the router and drawn over the shelf, so
    // staying on this page would leave the question floating over a form nobody needs.
    page({ status: "signedIn", firstSyncPending: true });

    expect(mocked.navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("does not sweep away a failed provider sign-in", () => {
    // It lands here to be told about, and the browser may still hold an older session.
    page({ status: "signedIn", firstSyncPending: false }, { oauthError: "true" });

    expect(mocked.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /Welcome back|Sign in/i })).toBeDefined();
  });

  /*
   * The bot check. These exist because the four cases above went on passing while the page
   * had stopped rendering at all: the mock is cast, so a field the page newly reads is a
   * runtime failure rather than a type error.
   */

  it("draws no widget, and no error, when the server has no check configured", () => {
    page({ status: "anonymous", firstSyncPending: false });

    expect(screen.queryByText(/check could not be loaded/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeDefined();
  });

  it("says so when the widget could not be loaded", () => {
    // A blocker or a strict network. Nothing is visible where the check should be, so the
    // only alternative to saying this is a form that fails for no stated reason.
    page(
      { status: "anonymous", firstSyncPending: false },
      {},
      { challenge: challenge({ required: true, failed: true }) },
    );

    expect(screen.getByText(/check could not be loaded/i)).toBeDefined();
  });

  it("holds the submit while the check is required and unsolved", () => {
    page(
      { status: "anonymous", firstSyncPending: false },
      {},
      { challenge: challenge({ required: true, satisfied: false }), canSubmit: false },
    );

    expect(screen.getByRole("button", { name: /Sign in/i }).hasAttribute("disabled")).toBe(true);
  });
});

/*
 * Sign-in turn 2: register used to scroll on a 1280 x 800 window. These pin the cuts that
 * carry behaviour rather than just spacing.
 */
describe("the refined register form", () => {
  const google = { id: "google", displayName: "Google" };

  it("asks for consent with one tick instead of two", () => {
    page({ status: "anonymous", firstSyncPending: false }, {}, { mode: "REGISTER" });

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /16 or older/i })).toBeDefined();
  });

  it("holds the provider buttons until the consent is ticked", () => {
    page(
      { status: "anonymous", firstSyncPending: false },
      {},
      { mode: "REGISTER", availableProviders: [google] },
    );

    expect(screen.getByRole("button", { name: "Google" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/once the box above is ticked/i)).toBeDefined();
  });

  it("lets a ticked consent through to the provider", () => {
    page(
      { status: "anonymous", firstSyncPending: false },
      {},
      { mode: "REGISTER", availableProviders: [google], consented: true },
    );

    expect(screen.queryByRole("button", { name: "Google" })).toBeNull();
    expect(screen.queryByText(/once the box above is ticked/i)).toBeNull();
  });

  it("never gates the providers when signing in", () => {
    page({ status: "anonymous", firstSyncPending: false }, {}, { availableProviders: [google] });

    expect(screen.queryByRole("button", { name: "Google" })).toBeNull();
    expect(screen.queryByText(/once the box above is ticked/i)).toBeNull();
  });

  it("offers the mode switch before the form, not after it", () => {
    page({ status: "anonymous", firstSyncPending: false }, {}, { mode: "REGISTER" });

    const heading = screen.getByRole("heading", { name: /Create account/i });
    const toSignIn = screen.getByRole("button", { name: /^Sign in$/i });
    expect(
      toSignIn.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
