// The page is mostly translated strings, so the real bundle is what it is rendered with.
import "@/i18n/config";
import { FriendsPage } from "@/features/friends/FriendsPage";
import type { useFriendsLogic } from "@/features/friends/useFriendsLogic";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * The shell and the router are not what these tests are about.
 *
 * `AppShell` puts the sidebar and the tab bar on screen, both of which are made of
 * `Link`s, and a real router would have to be given the whole route tree to render two
 * panes of one page. Everything the assertions touch is FriendsPage's own markup.
 */
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/library/useLibraryLogic", () => ({ useCollectionStats: () => undefined }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { readonly children: ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

const mocked = vi.hoisted(() => ({ logic: vi.fn() }));
vi.mock("@/features/friends/useFriendsLogic", () => ({ useFriendsLogic: mocked.logic }));

/** Someone signed in with a handle, one search hit and one request waiting. */
function logicWith(overrides: Record<string, unknown> = {}): ReturnType<typeof useFriendsLogic> {
  return {
    signedIn: true,
    needsHandle: false,
    handle: "janne",
    sharing: undefined,
    query: "marta",
    setQuery: vi.fn(),
    results: [{ id: "p-1", handle: "martaknopf", displayName: "Marta Knopf", copyCount: 31 }],
    searching: false,
    queryTooShort: false,
    searched: true,
    queryActive: true,
    nothingFound: false,
    entries: [],
    loading: false,
    friends: [],
    outgoing: [],
    incoming: [
      {
        id: "inv-1",
        from: { handle: "lukas", displayName: "Lukas", copyCount: 12 },
        mutualFriends: 3,
      },
    ],
    ask: { mutate: vi.fn(), isPending: false, variables: undefined },
    acceptRequest: { mutate: vi.fn(), isPending: false, variables: undefined },
    declineRequest: { mutate: vi.fn(), isPending: false, variables: undefined },
    unfriend: { mutate: vi.fn(), isPending: false, variables: undefined },
    claimHandle: { mutate: vi.fn(), isPending: false },
    ...overrides,
  } as unknown as ReturnType<typeof useFriendsLogic>;
}

/**
 * Whether anything between the node and the page root hides it under 640px.
 *
 * The two panes of 24g are not mounted and unmounted — they are both in the document and
 * CSS picks, the way the profile's two grids are. So "is it on the phone's screen" is a
 * question about the classes of its ancestors, and `toBeVisible` cannot answer it: jsdom
 * applies no media queries at all.
 */
function hiddenOnPhone(node: HTMLElement): boolean {
  for (let current: HTMLElement | null = node; current !== null; current = current.parentElement) {
    if (current.className?.includes?.("max-sm:hidden")) return true;
  }
  return false;
}

/** The mirror of the above: hidden by `sm:hidden` somewhere on the way up. */
function hiddenOnDesktop(node: HTMLElement): boolean {
  for (let current: HTMLElement | null = node; current !== null; current = current.parentElement) {
    const name = current.className;
    if (typeof name === "string" && /(?:^|\s)sm:hidden(?:\s|$)/.test(name)) return true;
  }
  return false;
}

describe("FriendsPage under 640px", () => {
  it("shows what the search found in the pane that holds the search box", () => {
    // The regression this exists for: results rendered only into the Activity pane,
    // which is hidden exactly while Find — the only pane with a search box — is open.
    // Typing worked, the request fired, and nothing appeared.
    mocked.logic.mockReturnValue(logicWith());
    render(<FriendsPage />);

    const hits = screen.getAllByText("Marta Knopf");
    expect(hits.some((hit) => !hiddenOnPhone(hit))).toBe(true);
    expect(hits.some((hit) => !hiddenOnDesktop(hit))).toBe(true);
  });

  it("shows a pending request in the pane whose tab counts it", () => {
    // The badge on Find says how many people are waiting, so Find has to be where they
    // are — a count pointing at a pane that does not contain them is a dead end.
    mocked.logic.mockReturnValue(
      logicWith({ query: "", results: [], searched: false, queryActive: false }),
    );
    render(<FriendsPage />);

    const cards = screen.getAllByText(/Lukas/);
    expect(cards.some((card) => !hiddenOnPhone(card))).toBe(true);
    expect(cards.some((card) => !hiddenOnDesktop(card))).toBe(true);
  });

  it("opens on Find while the feed is empty", () => {
    mocked.logic.mockReturnValue(logicWith({ entries: [], loading: false }));
    render(<FriendsPage />);

    const find = screen.getByRole("button", { name: /Find/ });
    expect(find.getAttribute("aria-current")).toBe("true");
  });
});

describe("FriendsPage Find tab while searching (2a)", () => {
  it("makes the results the whole tab and says how to get the rest back", () => {
    mocked.logic.mockReturnValue(logicWith({ friends: [{ id: "f-1", handle: "ole" }] }));
    render(<FriendsPage />);

    // Requests and People step aside on the phone only; the desktop keeps both.
    const cards = screen.getAllByText(/Lukas/);
    expect(cards.every((card) => hiddenOnPhone(card))).toBe(true);
    const people = screen.getByText("People · 1");
    expect(hiddenOnPhone(people)).toBe(true);
    expect(hiddenOnDesktop(people)).toBe(false);

    const phoneList = screen.getByText("Results · 1", { selector: "section div" });
    expect(hiddenOnPhone(phoneList)).toBe(false);
    const footnote = screen.getByText("Requests and People come back when you clear the search.");
    expect(hiddenOnPhone(footnote)).toBe(false);
    expect(hiddenOnDesktop(footnote)).toBe(true);
  });

  it("keeps counting requests on the Find badge while a query is active", () => {
    mocked.logic.mockReturnValue(logicWith());
    render(<FriendsPage />);

    expect(screen.getByRole("button", { name: /Find/ }).textContent).toContain("1");
  });

  it("says why nothing is showing", () => {
    mocked.logic.mockReturnValue(logicWith({ query: "zzzz", results: [], nothingFound: true }));
    render(<FriendsPage />);

    const said = screen.getAllByText("Nobody goes by that handle.");
    expect(said.some((line) => !hiddenOnPhone(line))).toBe(true);
  });

  it("brings requests and people back once the field is empty", () => {
    mocked.logic.mockReturnValue(
      logicWith({ query: "", results: [], searched: false, queryActive: false }),
    );
    render(<FriendsPage />);

    expect(screen.getAllByText(/Lukas/).some((card) => !hiddenOnPhone(card))).toBe(true);
    expect(hiddenOnPhone(screen.getByText("People · 0"))).toBe(false);
    expect(
      screen.queryByText("Requests and People come back when you clear the search."),
    ).toBeNull();
  });
});

describe("FriendsPage with no account", () => {
  it("still searches, and offers sign-in instead of an Add button", () => {
    // The regression this exists for: the whole page was a login wall, so a handle handed
    // to somebody without an account led to a screen that could not look it up.
    mocked.logic.mockReturnValue(logicWith({ signedIn: false }));
    render(<FriendsPage />);

    expect(screen.getByLabelText("Find a collector by handle")).toBeTruthy();
    expect(screen.getByText("Marta Knopf")).toBeTruthy();
    expect(screen.queryByText("Add")).toBeNull();
  });

  it("says nobody goes by a handle that found nothing", () => {
    mocked.logic.mockReturnValue(
      logicWith({ signedIn: false, results: [], searched: true, nothingFound: true }),
    );
    render(<FriendsPage />);

    expect(screen.getByText("Nobody goes by that handle.")).toBeTruthy();
  });
});

describe("FriendsPage search on the desktop", () => {
  it("answers in a popover under the field, not above the feed", () => {
    mocked.logic.mockReturnValue(logicWith());
    render(<FriendsPage />);

    const box = screen.getByRole("combobox");
    expect(box.getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("listbox");
    expect(box.getAttribute("aria-controls")).toBe(list.id);

    const option = within(list).getByRole("option");
    expect(option.getAttribute("aria-selected")).toBe("true");
    expect(box.getAttribute("aria-activedescendant")).toBe(option.id);
    expect(within(option).getByText("Marta Knopf")).toBeTruthy();
    expect(within(option).getByText("@martaknopf · 31 copies")).toBeTruthy();
    expect(within(option).getByText("Add")).toBeTruthy();
    const popover = within(box.parentElement as HTMLElement);
    expect(popover.getByText("Results · 1")).toBeTruthy();
    expect(popover.getByText("↑ ↓ move · Enter opens the shelf · Esc closes")).toBeTruthy();

    // The only desktop copy of the result is the popover's; the feed column holds none.
    const desktopHits = screen.getAllByText("Marta Knopf").filter((hit) => !hiddenOnDesktop(hit));
    expect(desktopHits).toHaveLength(1);
    expect(list.contains(desktopHits[0] ?? null)).toBe(true);
  });

  it("closes on Escape", () => {
    mocked.logic.mockReturnValue(logicWith());
    render(<FriendsPage />);

    const box = screen.getByRole("combobox");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(within(box.parentElement as HTMLElement).queryByText("Results · 1")).toBeNull();
  });

  it("asks for three characters inside the popover", () => {
    mocked.logic.mockReturnValue(
      logicWith({ query: "ma", results: [], searched: false, queryTooShort: true }),
    );
    render(<FriendsPage />);

    const popover = within(screen.getByRole("combobox").parentElement as HTMLElement);
    expect(popover.getByText("Three characters at least.")).toBeTruthy();
  });

  it("shows the spinner over the previous results while searching", () => {
    mocked.logic.mockReturnValue(logicWith({ query: "martak", searching: true }));
    render(<FriendsPage />);

    expect(screen.getByText("Searching")).toBeTruthy();
    expect(within(screen.getByRole("listbox")).getByText("Marta Knopf")).toBeTruthy();
  });
});
