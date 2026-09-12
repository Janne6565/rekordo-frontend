import { useSharingLogic } from "@/features/friends/useSharingLogic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock("@/api/generated/sharing/sharing", () => ({ read, update }));
vi.mock("@/api/generated/handles/handles", () => ({ availability: vi.fn(), claim: vi.fn() }));

const SETTINGS = {
  handle: "janne",
  collectionVisibility: "FRIENDS",
  wishlistVisibility: "PUBLIC",
  pricesPublic: true,
  ratingsShared: false,
  findable: true,
} as const;

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/**
 * 15f saves on change and sends the whole screen each time, so the risk a new switch adds
 * is not that it fails to save but that saving *it* quietly resets one of the others.
 */
describe("useSharingLogic", () => {
  beforeEach(() => {
    read.mockReset();
    update.mockReset();
  });

  it("turns ratings on without disturbing the other answers", async () => {
    read.mockResolvedValue({ ...SETTINGS });
    update.mockImplementation(async (body) => ({ handle: "janne", ...body }));

    const { result } = renderHook(() => useSharingLogic(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.settings?.handle).toBe("janne"));

    act(() => result.current.set({ ratingsShared: true }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      collectionVisibility: "FRIENDS",
      wishlistVisibility: "PUBLIC",
      pricesPublic: true,
      ratingsShared: true,
      findable: true,
    });
    // And the answer the server gives back is what the panel then draws, rather than the
    // optimistic value the switch was clicked into.
    await waitFor(() => expect(result.current.settings?.ratingsShared).toBe(true));
  });

  it("sends ratings off for an account that has never been asked", async () => {
    // Nullable on the wire (an account older than the switch). `?? false` is what keeps the
    // request body's required boolean from going out as null.
    read.mockResolvedValue({ ...SETTINGS, ratingsShared: null });
    update.mockImplementation(async (body) => ({ handle: "janne", ...body }));

    const { result } = renderHook(() => useSharingLogic(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.settings?.handle).toBe("janne"));

    act(() => result.current.set({ findable: false }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0].ratingsShared).toBe(false);
  });
});
