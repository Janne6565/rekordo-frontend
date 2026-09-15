import { firstPullPercent, firstPullSteps } from "@/features/firstPull/lib";
import { describe, expect, it } from "vitest";

describe("firstPullSteps", () => {
  it("has the collection and wishlist busy together while pages arrive", () => {
    expect(firstPullSteps("pulling", 12, 3)).toEqual([
      { key: "collection", state: "busy", count: 12 },
      { key: "wishlist", state: "busy", count: 3 },
      { key: "catalogue", state: "waiting", count: null },
    ]);
  });

  it("marks both done and the catalogue busy after the last page", () => {
    expect(firstPullSteps("catalogue", 240, 18).map((step) => step.state)).toEqual([
      "done",
      "done",
      "busy",
    ]);
  });

  it("is all done once idle", () => {
    expect(firstPullSteps("idle", 0, 0).every((step) => step.state === "done")).toBe(true);
  });
});

describe("firstPullPercent", () => {
  it("counts only finished parts", () => {
    expect(firstPullPercent(firstPullSteps("pulling", 50, 5))).toBe(0);
    expect(firstPullPercent(firstPullSteps("catalogue", 50, 5))).toBe(67);
    expect(firstPullPercent(firstPullSteps("idle", 50, 5))).toBe(100);
  });

  it("is zero with no steps", () => {
    expect(firstPullPercent([])).toBe(0);
  });
});
