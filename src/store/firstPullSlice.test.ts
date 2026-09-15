import { signedOut } from "@/store/authSlice";
import reducer, {
  firstPullFinished,
  firstPullPage,
  firstPullStarted,
} from "@/store/firstPullSlice";
import { describe, expect, it } from "vitest";

const idle = reducer(undefined, { type: "@@init" });

describe("firstPullSlice", () => {
  it("starts idle", () => {
    expect(idle).toEqual({ stage: "idle", copies: 0, wishes: 0 });
  });

  it("adds up pages and moves to the catalogue after the last one", () => {
    let state = reducer(idle, firstPullStarted());
    state = reducer(state, firstPullPage({ copies: 100, wishes: 10, last: false }));
    expect(state).toEqual({ stage: "pulling", copies: 100, wishes: 10 });
    state = reducer(state, firstPullPage({ copies: 40, wishes: 8, last: true }));
    expect(state).toEqual({ stage: "catalogue", copies: 140, wishes: 18 });
  });

  it("ignores pages from the steady-state sync once idle", () => {
    expect(reducer(idle, firstPullPage({ copies: 3, wishes: 1, last: true }))).toEqual(idle);
  });

  it("ignores late pages once the catalogue stage has begun", () => {
    const catalogue = { stage: "catalogue" as const, copies: 5, wishes: 0 };
    expect(reducer(catalogue, firstPullPage({ copies: 9, wishes: 9, last: true }))).toEqual(
      catalogue,
    );
  });

  it("returns to idle when finished or signed out", () => {
    const pulling = reducer(idle, firstPullStarted());
    expect(reducer(pulling, firstPullFinished())).toEqual(idle);
    expect(reducer(pulling, signedOut())).toEqual(idle);
  });
});
