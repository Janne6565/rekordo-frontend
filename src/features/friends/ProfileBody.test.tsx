// The shelf is mostly translated strings, so the real bundle is what it is rendered with.
import "@/i18n/config";
import type { SharedCopyDto, SharedWishDto } from "@/api/generated/rekordoAPI.schemas";
import { ProfileBody } from "@/features/friends/ProfilePage";
import type { useProfileLogic } from "@/features/friends/useProfileLogic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // jsdom knows the <dialog> element but not the top layer.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

const COPIES: SharedCopyDto[] = [
  {
    id: "one",
    title: "Remain in Light",
    artistName: "Talking Heads",
    year: 1980,
    format: "VINYL",
    condition: "VG_PLUS",
    sleeveCondition: "NM",
    pricePaidCents: 2400,
    currency: "EUR",
    rating: 4,
    createdAt: Date.UTC(2024, 2, 4),
  },
  { id: "two", title: "Lanquidity", artistName: "Sun Ra", format: "VINYL" },
];

// The generated types say every field is optional, but the wire sends null for a wish
// with no year and no format on it — which is what crashed the sheet.
const WISHES: SharedWishDto[] = [
  { id: "wish-one", title: "Bitches Brew", artistName: "Miles Davis", year: 1970 },
  {
    id: "wish-two",
    title: "Nobody Pinned A Year On This",
    artistName: "Unknown",
    year: null,
    desiredFormat: null,
  } as unknown as SharedWishDto,
];

/**
 * A profile that is entirely readable, seen by its owner.
 *
 * SELF because every other relationship puts a router `Link` in the header, and this test
 * is about the shelf underneath it.
 */
function logicFor(pricesVisible: boolean): ReturnType<typeof useProfileLogic> {
  return {
    signedIn: true,
    handle: "janne",
    person: {
      handle: "janne",
      displayName: "Janne",
      relationship: "SELF",
      canSeeCollection: true,
      canSeeWishlist: true,
      copyCount: 42,
      wishlistCount: 18,
      pricesVisible,
    },
    loading: false,
    notFound: false,
    copies: pricesVisible ? COPIES : COPIES.map(({ pricePaidCents, currency, ...rest }) => rest),
    copiesTruncated: false,
    wishes: WISHES,
    loadingLists: false,
  } as unknown as ReturnType<typeof useProfileLogic>;
}

/**
 * The same shelf, seen by somebody the owner has asked to be friends with.
 *
 * The two buttons are what this fixture is for: before turn 29 the switch had no case for
 * REQUEST_RECEIVED and fell through to "Ask to be friends", which the server refuses.
 */
function askedLogic(accept: () => void, declineIt: () => void): ReturnType<typeof useProfileLogic> {
  return {
    ...logicFor(true),
    person: {
      handle: "janne2",
      displayName: "Janne Keipert",
      relationship: "REQUEST_RECEIVED",
      pendingRequestId: "request-1",
      canSeeCollection: false,
      canSeeWishlist: false,
      copyCount: 3,
      wishlistCount: 0,
    },
    acceptRequest: { mutate: accept, isPending: false },
    declineRequest: { mutate: declineIt, isPending: false },
  } as unknown as ReturnType<typeof useProfileLogic>;
}

function wishShelf(openId: string | undefined) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfileBody
        logic={logicFor(true)}
        tab="wishlist"
        onTab={vi.fn()}
        openId={openId}
        onOpen={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function shelf(openId: string | undefined, onOpen = vi.fn(), pricesVisible = true) {
  // A hidden shelf arrives with no amounts on it at all, which is what the server does.
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfileBody
        logic={logicFor(pricesVisible)}
        tab="collection"
        onTab={vi.fn()}
        openId={openId}
        onOpen={onOpen}
      />
    </QueryClientProvider>,
  );
  return { ...view, onOpen };
}

describe("the public shelf", () => {
  it("opens a record by address rather than by remembering a click", () => {
    const { onOpen } = shelf(undefined);

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Remain in Light/ }));

    expect(onOpen).toHaveBeenCalledWith("one");
  });

  it("draws the sheet for whichever record the address names", () => {
    shelf("two");

    expect(screen.getByRole("heading", { name: "Lanquidity" })).toBeDefined();
    // Second of two, and the only two facts it has.
    expect(screen.getByText("2 of 2")).toBeDefined();
    expect(screen.queryByText("Year")).toBeNull();
  });

  it("shows condition and price on somebody else's copy", () => {
    // Which contradicts the footnote on 15i: the public page used to say condition and
    // price are never shown, and turn 23 overrules it for the sheet.
    shelf("one");
    const sheet = within(screen.getByRole("dialog"));

    // Both grids are in the document — the wide one and 23e's phone one, which CSS picks
    // between — so each fact is found twice.
    expect(sheet.getAllByText("VG+").length).toBeGreaterThan(0);
    expect(sheet.getAllByText(/NM/).length).toBeGreaterThan(0);
    // The locale decides where the symbol goes; what matters is that the amount is there.
    expect(sheet.getAllByText(/24[.,]00/).length).toBeGreaterThan(0);
    expect(sheet.getByText("Janne's copy")).toBeDefined();
  });

  it("obeys the owner's switch on prices", () => {
    // 15f is the owner's decision about the whole shelf, and the sheet is not a way round
    // it — the server strips the amount, and the sheet drops the field rather than ruling
    // an empty row for it.
    shelf("one", vi.fn(), false);
    const sheet = within(screen.getByRole("dialog"));

    expect(sheet.queryAllByText("Paid")).toHaveLength(0);
    expect(sheet.getByText("prices hidden")).toBeDefined();
  });

  it("puts the owner's stars on the tile and in the sheet", () => {
    shelf("one");

    // Once on the tile behind the sheet, and once in each of the two fact grids the sheet
    // keeps in the document — so the only useful assertion is that it is there at all.
    expect(screen.getAllByLabelText("Rate 4 out of 5").length).toBeGreaterThan(1);
    expect(within(screen.getByRole("dialog")).getAllByText("Rating").length).toBeGreaterThan(0);
  });

  it("drops the rating row for a copy that arrives without one", () => {
    // Unrated, or rated by somebody who does not share their ratings: the server sends null
    // for both and the sheet must not hint at which — no row, no dash, no empty label.
    shelf("two");
    const sheet = within(screen.getByRole("dialog"));

    expect(sheet.queryAllByText("Rating")).toHaveLength(0);
    // Scoped to the sheet: the shelf behind it still holds the rated copy.
    expect(sheet.queryByLabelText(/Rate \d out of 5/)).toBeNull();
  });

  it("stays shut when the link names a record that is not here", () => {
    shelf("gone");

    expect(screen.queryByRole("heading", { name: "Remain in Light" })).toBeNull();
  });
});

describe("the wishlist sheet", () => {
  it("draws a wish whose year and format are null rather than throwing", () => {
    // A `?wish=` link to an entry with no year read `null.toString()` and took the whole
    // page down with it.
    wishShelf("wish-two");
    const sheet = within(screen.getByRole("dialog"));

    expect(sheet.getByRole("heading", { name: "Nobody Pinned A Year On This" })).toBeDefined();
    expect(sheet.queryByText("Year")).toBeNull();
    expect(sheet.queryByText("Looking for")).toBeNull();
  });

  it("still rules the facts it does have", () => {
    wishShelf("wish-one");
    const sheet = within(screen.getByRole("dialog"));

    expect(sheet.getAllByText("1970").length).toBeGreaterThan(0);
  });
});

describe("a shelf whose owner asked first", () => {
  function asked() {
    const accept = vi.fn();
    const declineIt = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProfileBody
          logic={askedLogic(accept, declineIt)}
          tab="collection"
          onTab={vi.fn()}
          openId={undefined}
          onOpen={vi.fn()}
        />
      </QueryClientProvider>,
    );
    return { accept, declineIt };
  }

  it("offers an answer rather than the ask button", () => {
    asked();

    // Both shapes are in the document — the one beside the name and 15c's own row — so
    // each label is found twice, and neither of them is the ask.
    expect(screen.getAllByRole("button", { name: "Accept" }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Decline" }).length).toBe(2);
    expect(screen.queryByRole("button", { name: /Ask to be friends/ })).toBeNull();
  });

  it("answers the request, not the person", () => {
    const { accept, declineIt } = asked();

    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0]);
    expect(accept).toHaveBeenCalledWith("request-1");

    fireEvent.click(screen.getAllByRole("button", { name: "Decline" })[0]);
    expect(declineIt).toHaveBeenCalledWith("request-1");
  });
});

describe("the collection/wishlist switch", () => {
  function switchFor(canSeeCollection: boolean | undefined, canSeeWishlist: boolean | undefined) {
    const onTab = vi.fn();
    const logic = logicFor(true);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProfileBody
          logic={
            {
              ...logic,
              person: { ...logic.person, canSeeCollection, canSeeWishlist },
            } as ReturnType<typeof useProfileLogic>
          }
          tab="collection"
          onTab={onTab}
          openId={undefined}
          onOpen={vi.fn()}
        />
      </QueryClientProvider>,
    );
    return {
      onTab,
      collection: screen.getByRole("button", { name: /^Collection/ }) as HTMLButtonElement,
      wishlist: screen.getByRole("button", { name: /^Wishlist/ }) as HTMLButtonElement,
    };
  }

  it("locks the half whose list the viewer cannot read", () => {
    const { onTab, collection, wishlist } = switchFor(true, false);

    expect(collection.disabled).toBe(false);
    expect(wishlist.disabled).toBe(true);
    expect(wishlist.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(wishlist);
    expect(onTab).not.toHaveBeenCalled();
  });

  it("locks both halves of a private shelf and keeps the open one selected", () => {
    const { collection, wishlist } = switchFor(false, false);

    expect(collection.disabled).toBe(true);
    expect(wishlist.disabled).toBe(true);
    expect(collection.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("This shelf is for friends")).toBeDefined();
  });

  it("leaves both halves alone while nothing is known about the lists", () => {
    const { onTab, collection, wishlist } = switchFor(undefined, undefined);

    expect(collection.disabled).toBe(false);
    fireEvent.click(wishlist);
    expect(onTab).toHaveBeenCalledWith("wishlist");
  });
});
