// The page is translated strings and nothing else, so the real bundle is what it is rendered with.
import "@/i18n/config";
import { NotFoundPage } from "@/features/notFound/NotFoundPage";
import { NotFoundState, UnknownCollector } from "@/features/notFound/NotFoundState";
import type { NotFoundLogic } from "@/features/notFound/useNotFoundLogic";
import { render, screen } from "@testing-library/react";
import { LibraryBig } from "lucide-react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/** The shell and the router are not what these tests are about; see FriendsPage.test. */
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));
vi.mock("@/features/library/useLibraryLogic", () => ({ useCollectionStats: () => undefined }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    readonly children: ReactNode;
    readonly to: string;
    readonly params?: { readonly doc?: string };
  }) => <a href={params?.doc === undefined ? to : `/legal/${params.doc}`}>{children}</a>,
}));

const mocked = vi.hoisted(() => ({ logic: vi.fn() }));
vi.mock("@/features/notFound/useNotFoundLogic", () => ({ useNotFoundLogic: mocked.logic }));

function logicWith(overrides: Partial<NotFoundLogic> = {}): NotFoundLogic {
  return {
    frame: "standalone",
    signedIn: false,
    path: "/shelf/2019",
    host: "rekordo.de",
    bareHandle: false,
    ...overrides,
  };
}

function hrefOf(name: string): string | null {
  return screen.getByRole("link", { name }).getAttribute("href");
}

describe("NotFoundPage", () => {
  it("stands alone for a visitor, with a way in and the legal row (30c)", () => {
    mocked.logic.mockReturnValue(logicWith());
    render(<NotFoundPage />);

    expect(screen.queryByTestId("shell")).toBeNull();
    expect(screen.getByRole("heading", { name: "This sleeve is empty." })).toBeTruthy();
    expect(screen.getByText("404 · Not found")).toBeTruthy();
    expect(screen.getByText("rekordo.de")).toBeTruthy();
    expect(screen.getByText("/shelf/2019")).toBeTruthy();
    expect(hrefOf("Sign in")).toBe("/signin");
    expect(hrefOf("Go to the start page")).toBe("/");
    expect(hrefOf("Find collectors")).toBe("/friends");
    expect(hrefOf("Impressum")).toBe("/legal/impressum");
    expect(hrefOf("Datenschutz")).toBe("/legal/datenschutz");
    expect(hrefOf("AGB")).toBe("/legal/nutzungsbedingungen");
  });

  it("keeps the shell for somebody signed in and leads back to the library (30a)", () => {
    mocked.logic.mockReturnValue(logicWith({ frame: "shell", signedIn: true }));
    render(<NotFoundPage />);

    expect(screen.getByTestId("shell")).toBeTruthy();
    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Back to your library", "Find collectors"]);
    expect(screen.queryByText("Impressum")).toBeNull();
    expect(screen.queryByText("Sign in")).toBeNull();
  });

  it("says the name is missing on a bare @, with no chip and the search first (30d)", () => {
    mocked.logic.mockReturnValue(logicWith({ path: "/@/wishlist", bareHandle: true }));
    render(<NotFoundPage />);

    expect(
      screen.getByText(
        "This link ends before the collector's name. Ask whoever sent it for the full address.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("/@/wishlist")).toBeNull();
    expect(screen.queryByText("404")).toBeNull();
    const actions = screen
      .getAllByRole("link")
      .map((link) => link.textContent)
      .filter((text) => text === "Find collectors" || text === "Go to the start page");
    expect(actions).toEqual(["Find collectors", "Go to the start page"]);
  });

  it("draws nothing until the session is known", () => {
    mocked.logic.mockReturnValue(logicWith({ frame: "pending" }));
    const { container } = render(<NotFoundPage />);

    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("UnknownCollector", () => {
  it("puts the handle on the sleeve and keeps the profile's own strings (30f)", () => {
    render(<UnknownCollector handle="nobody" signedIn={false} />);

    expect(screen.getByText("@nobody")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No such collector" })).toBeTruthy();
    expect(screen.getByText("Nobody goes by @nobody.")).toBeTruthy();
    const links = screen.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Find collectors", "Go to the start page"]);
  });
});

describe("NotFoundState", () => {
  it("draws a gone item as a slot with no number and no address (30g)", () => {
    render(
      <NotFoundState
        mark="slot"
        title="Nothing in the slot."
        body="That item is no longer in your collection."
        actions={[{ to: "/", label: "Back to your library", icon: LibraryBig }]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Nothing in the slot." })).toBeTruthy();
    expect(screen.queryByText("404 · Not found")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
