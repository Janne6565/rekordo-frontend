import "fake-indexeddb/auto";
import { DexieLocalStore } from "@/local/dexieStore";
import type { ClockSource, Release } from "@janne6565/rekordo-shared";
import {
  LOCAL_WRITE_SYNC_DELAY_MS,
  applyCopyPatch,
  createCopy,
  hlcInitial,
  hlcTick,
  observeLocalWrites,
  useSyncLoop,
} from "@janne6565/rekordo-shared";
import { act, renderHook } from "@testing-library/react";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function clockSource(): ClockSource {
  let current = hlcInitial("test-device");
  let wall = 1000;
  return {
    next() {
      wall += 1;
      current = hlcTick(current, wall);
      return current;
    },
  };
}

const vinyl = {
  id: "r-vinyl",
  albumId: "group-brew",
  title: "Bitches Brew",
  artistName: "Miles Davis",
  year: 1970,
  format: "VINYL",
  label: null,
  catalogNumber: null,
  country: null,
  barcode: null,
  releaseDate: null,
  trackCount: null,
  discCount: null,
  coverArtUrl: null,
  coverTheme: null,
  cachedAt: 0,
} satisfies Release;

const draft = {
  condition: "VG_PLUS" as const,
  sleeveCondition: "NM" as const,
  catalogArt: "AUTO" as const,
  pricePaidCents: null,
  currency: "EUR",
  purchasedOn: null,
  purchasedAt: null,
  notes: null,
  rating: null,
};

/**
 * The bug this covers: hiding a copy from others on the web reached the server only on
 * the next minute's tick, so the public profile still showed it. The real Dexie store
 * behind the observer, because a proxy that broke its `this` would break every screen.
 */
describe("a local write on the web", () => {
  beforeEach(async () => {
    await Dexie.delete("music-collector");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules a sync pass within seconds, with the edit already pending", async () => {
    const { store, localWrites } = observeLocalWrites(new DexieLocalStore());
    await store.open();
    const clock = clockSource();
    const copy = createCopy(vinyl, draft, clock, 1000, "copy-1");
    await store.putCopy(copy);
    await store.writePendingIds([]);

    const pendingSeenByPass: string[][] = [];
    const run = vi.fn(async () => {
      pendingSeenByPass.push(await store.readPendingIds());
    });
    renderHook(() => useSyncLoop({ active: true, run, localWrites, intervalMs: 60_000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(run).toHaveBeenCalledTimes(1);

    await act(async () => {
      await store.putCopy(applyCopyPatch(copy, { hidden: true }, clock));
      await vi.advanceTimersByTimeAsync(LOCAL_WRITE_SYNC_DELAY_MS);
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(pendingSeenByPass[1]).toEqual(["copy-1"]);
  });
});
