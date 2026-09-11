import { ConsentSlip } from "@/features/diagnostics/ConsentSlip";
import { store } from "@/store";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n/config";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { readonly children: ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock("@/diagnostics/faro", () => ({
  startDiagnostics: vi.fn(),
  setDiagnosticsUser: vi.fn(),
}));

function renderSlip() {
  return render(
    <Provider store={store}>
      <ConsentSlip />
    </Provider>,
  );
}

/**
 * The slip actually rendering.
 *
 * Typecheck and lint both pass on a component that throws the moment it mounts, so the
 * point of this file is the render itself: every string resolved, every token a real
 * class, the radio group wired to the hook. The behavioural rules live in
 * `useConsentSlipLogic.test.ts`; this is the part that only a DOM can answer.
 */
describe("ConsentSlip", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the question, all three levels and an inert Save", () => {
    renderSlip();
    expect(screen.getByText("How much may Rekordo tell us when it breaks?")).toBeDefined();
    expect(screen.getByText("Anonymous only")).toBeDefined();
    expect(screen.getByText("Full")).toBeDefined();
    expect(screen.getByText("Nothing")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save choice" })).toHaveProperty("disabled", true);
  });

  it("presents the three levels as one radio group, so nothing is preselected", () => {
    renderSlip();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
  });

  it("enables Save once a level is picked", () => {
    renderSlip();
    fireEvent.click(screen.getByTestId("consent-level-ANONYMOUS"));
    expect(screen.getByRole("button", { name: "Save choice" })).toHaveProperty("disabled", false);
  });

  it("shows the corrected disclosure, not the draft that claimed the IP was stored", () => {
    renderSlip();
    fireEvent.click(screen.getByRole("button", { name: /What each level collects/ }));
    expect(screen.getByText(/Your IP address is not stored/)).toBeDefined();
    expect(screen.getByText(/cleared when that tab closes/)).toBeDefined();
  });

  it("stays out of the way of a browser that has already answered", () => {
    globalThis.localStorage.setItem(
      "music-collector-diagnostics-consent",
      JSON.stringify({ level: "NOTHING", at: 1 }),
    );
    renderSlip();
    expect(screen.queryByTestId("consent-slip")).toBeNull();
  });

  it("is an aside rather than a dialog, because it blocks nothing", () => {
    renderSlip();
    // A `dialog` role would tell a screen-reader user they have to deal with this before
    // the page is usable, which is the opposite of what everyone else sees.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("complementary")).toBeDefined();
  });
});
