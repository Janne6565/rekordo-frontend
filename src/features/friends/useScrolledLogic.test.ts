import { useScrolledLogic } from "@/features/friends/useScrolledLogic";
import { act, renderHook } from "@testing-library/react";
import type { UIEvent } from "react";
import { describe, expect, it } from "vitest";

function scrollTo(top: number) {
  return { currentTarget: { scrollTop: top } } as unknown as UIEvent<HTMLElement>;
}

describe("useScrolledLogic", () => {
  it("is flat at the top and raised once the area scrolls", () => {
    const { result } = renderHook(() => useScrolledLogic());
    expect(result.current.scrolled).toBe(false);
    act(() => result.current.onScroll(scrollTo(40)));
    expect(result.current.scrolled).toBe(true);
    act(() => result.current.onScroll(scrollTo(0)));
    expect(result.current.scrolled).toBe(false);
  });
});
