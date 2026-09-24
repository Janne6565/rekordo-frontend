import type { ProfileSummaryDto } from "@/api/generated/rekordoAPI.schemas";
import {
  type FriendsSearchSource,
  useFriendsSearchLogic,
} from "@/features/friends/useFriendsSearchLogic";
import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const people: ProfileSummaryDto[] = [
  { id: "1", handle: "janne", displayName: "Janne" },
  { id: "2", handle: "jana", displayName: "Jana" },
  { id: "3", handle: "jan", displayName: "Jan" },
];

function source(overrides: Partial<FriendsSearchSource> = {}): FriendsSearchSource {
  return {
    query: "jan",
    setQuery: vi.fn(),
    results: people,
    searching: false,
    queryTooShort: false,
    searched: true,
    ...overrides,
  };
}

function key(name: string) {
  const preventDefault = vi.fn();
  return {
    event: { key: name, preventDefault } as unknown as KeyboardEvent<HTMLInputElement>,
    preventDefault,
  };
}

function setup(initial: FriendsSearchSource) {
  return renderHook((props: FriendsSearchSource) => useFriendsSearchLogic(props), {
    initialProps: initial,
  });
}

beforeEach(() => navigate.mockReset());

describe("useFriendsSearchLogic", () => {
  it("opens on the first result", () => {
    const { result } = setup(source());
    expect(result.current.open).toBe(true);
    expect(result.current.view).toBe("results");
    expect(result.current.activeIndex).toBe(0);
  });

  it("stays closed with nothing typed", () => {
    const { result } = setup(source({ query: "  ", results: [], searched: false }));
    expect(result.current.view).toBe("closed");
  });

  it("wraps the active row with the arrow keys", () => {
    const { result } = setup(source());
    act(() => result.current.keyDown(key("ArrowUp").event));
    expect(result.current.activeIndex).toBe(2);
    act(() => result.current.keyDown(key("ArrowDown").event));
    expect(result.current.activeIndex).toBe(0);
    act(() => result.current.keyDown(key("ArrowDown").event));
    expect(result.current.activeIndex).toBe(1);
  });

  it("opens the active person's shelf on Enter and closes", () => {
    const { result } = setup(source());
    act(() => result.current.keyDown(key("ArrowDown").event));
    const enter = key("Enter");
    act(() => result.current.keyDown(enter.event));
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({
      to: "/friends/$handle",
      params: { handle: "jana" },
    });
    expect(result.current.open).toBe(false);
  });

  it("closes on Escape and reopens on typing", () => {
    const setQuery = vi.fn();
    const { result } = setup(source({ setQuery }));
    act(() => result.current.keyDown(key("Escape").event));
    expect(result.current.view).toBe("closed");

    act(() =>
      result.current.change({ target: { value: "jann" } } as ChangeEvent<HTMLInputElement>),
    );
    expect(setQuery).toHaveBeenCalledWith("jann");
    expect(result.current.open).toBe(true);
  });

  it("reopens with ArrowDown after Escape", () => {
    const { result } = setup(source());
    act(() => result.current.keyDown(key("Escape").event));
    act(() => result.current.keyDown(key("ArrowDown").event));
    expect(result.current.open).toBe(true);
    expect(result.current.activeIndex).toBe(0);
  });

  it("closes on a click outside, not on one inside", () => {
    const { result } = setup(source());
    const inside = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(inside, outside);
    (result.current.root as { current: HTMLDivElement | null }).current = inside;

    act(() => inside.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(result.current.open).toBe(true);
    act(() => outside.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(result.current.open).toBe(false);
  });

  it("clears the field, which closes the popover", () => {
    const setQuery = vi.fn();
    const { result, rerender } = setup(source({ setQuery }));
    act(() => result.current.clear());
    expect(setQuery).toHaveBeenCalledWith("");
    rerender(source({ setQuery, query: "", results: [], searched: false }));
    expect(result.current.view).toBe("closed");
  });

  it("says three characters at least below the minimum", () => {
    const { result } = setup(
      source({ query: "ja", results: [], searched: false, queryTooShort: true }),
    );
    expect(result.current.view).toBe("tooShort");
  });

  it("says nobody once an answer came back empty, not while it is on its way", () => {
    const { result, rerender } = setup(source({ query: "zzz", results: [], searching: true }));
    expect(result.current.view).toBe("searching");
    rerender(source({ query: "zzz", results: [], searching: false }));
    expect(result.current.view).toBe("noMatches");
  });

  it("keeps the previous results on screen while the next ones load", () => {
    const { result } = setup(source({ query: "jann", searching: true }));
    expect(result.current.view).toBe("results");
    expect(result.current.searching).toBe(true);
    expect(result.current.count).toBe(3);
  });

  it("keeps the cursor on the last row when the list shrinks", () => {
    const { result, rerender } = setup(source());
    act(() => result.current.keyDown(key("ArrowUp").event));
    rerender(source({ results: people.slice(0, 1) }));
    expect(result.current.activeIndex).toBe(0);
  });
});
