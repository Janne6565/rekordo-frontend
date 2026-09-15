// The screen is translated strings and counts, so the real bundle is what it is rendered with.
import "@/i18n/config";
import { FirstPullScreen } from "@/features/firstPull/FirstPullScreen";
import authReducer, { signedIn } from "@/store/authSlice";
import firstPullReducer, { firstPullPage, firstPullStarted } from "@/store/firstPullSlice";
import { configureStore } from "@reduxjs/toolkit";
import { render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";

function mount(pages: readonly { copies: number; wishes: number; last: boolean }[]) {
  const store = configureStore({ reducer: { auth: authReducer, firstPull: firstPullReducer } });
  store.dispatch(firstPullStarted());
  store.dispatch(
    signedIn({ user: { id: "u-1", email: "jonas@meyer.de" } as never, firstSyncPending: false }),
  );
  for (const page of pages) store.dispatch(firstPullPage(page));
  return render(
    <Provider store={store}>
      <FirstPullScreen />
    </Provider>,
  );
}

function row(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement;
}

describe("FirstPullScreen", () => {
  it("shows the collection and wishlist fetching and the catalogue queued at first", () => {
    mount([]);
    expect(screen.getByRole("heading", { name: "Getting your shelf" })).toBeTruthy();
    expect(within(row("Your collection")).getByText("fetching")).toBeTruthy();
    expect(within(row("Wishlist")).getByText("fetching")).toBeTruthy();
    expect(within(row("Titles and covers")).getByText("queued")).toBeTruthy();
    expect((screen.getByRole("progressbar") as HTMLProgressElement).value).toBe(0);
    expect(screen.getByText("Signed in as jonas@meyer.de")).toBeTruthy();
  });

  it("counts what arrived and moves on to titles and covers after the last page", () => {
    mount([
      { copies: 200, wishes: 18, last: false },
      { copies: 40, wishes: 0, last: true },
    ]);
    expect(within(row("Your collection")).getByText("240 items")).toBeTruthy();
    expect(within(row("Wishlist")).getByText("18 items")).toBeTruthy();
    expect(within(row("Titles and covers")).getByText("fetching")).toBeTruthy();
    expect((screen.getByRole("progressbar") as HTMLProgressElement).value).toBe(67);
  });
});
