// The section is mostly translated strings, so it is rendered with the real bundle.
import "@/i18n/config";
import type { Tracklist as TracklistData } from "@/api/tracklist";
import { Tracklist } from "@/features/tracklist/Tracklist";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchTracklist = vi.hoisted(() => vi.fn());
vi.mock("@/api/tracklist", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/tracklist")>()),
  fetchTracklist,
}));

const RELEASE = "musicbrainz:e32a3f0b-1c19-3170-bb1c-650893774744";

function tracklist(over: Partial<TracklistData> = {}): TracklistData {
  return { trackCount: null, discCount: null, media: [], absence: null, ...over };
}

function wall(): TracklistData {
  return tracklist({
    trackCount: 26,
    discCount: 2,
    media: [
      {
        position: 1,
        format: '12" Vinyl',
        title: null,
        tracks: [
          { number: "A1", title: "In the Flesh?", lengthMs: 199_560, artistName: null },
          { number: "B6", title: "Goodbye Cruel World", lengthMs: null, artistName: null },
        ],
      },
      {
        position: 2,
        format: '12" Vinyl',
        title: null,
        tracks: [{ number: "C1", title: "Hey You", lengthMs: 284_000, artistName: null }],
      },
    ],
  });
}

function renderSection(props: Parameters<typeof Tracklist>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Tracklist {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchTracklist.mockReset();
});

describe("Tracklist", () => {
  it("shows the catalogue's own numbering, and a disc heading only once there are two", async () => {
    fetchTracklist.mockResolvedValue(wall());
    renderSection({ releaseId: RELEASE });

    expect(await screen.findByText("In the Flesh?")).toBeTruthy();
    // The side break between B6 and C1 is what a vinyl owner is looking for here, so
    // nothing may renumber the rows from their position.
    expect(screen.getByText("C1")).toBeTruthy();
    expect(screen.getAllByText(/12″ Vinyl · \d of 2|12" Vinyl · \d of 2/)).toHaveLength(2);
  });

  it("draws no duration at all for a track nobody timed", async () => {
    fetchTracklist.mockResolvedValue(wall());
    const { container } = renderSection({ releaseId: RELEASE });

    await screen.findByText("Goodbye Cruel World");
    // 199_560 ms is 3:19.56, and a track is named by the minute it fills.
    expect(container.textContent).toContain("3:20");
    expect(container.textContent).not.toContain("—");
  });

  it("names a single disc nothing, because the format is already in the facts above", async () => {
    fetchTracklist.mockResolvedValue(
      tracklist({
        trackCount: 2,
        discCount: 1,
        media: [
          {
            position: 1,
            format: '7" Vinyl',
            title: null,
            tracks: [
              { number: "A", title: "Temptation", lengthMs: 419_000, artistName: null },
              { number: "B", title: "Hurt", lengthMs: 329_000, artistName: null },
            ],
          },
        ],
      }),
    );
    const { container } = renderSection({ releaseId: RELEASE });

    await screen.findByText("Temptation");
    expect(container.textContent).not.toContain("1 of 1");
  });

  it("carries a per-track credit only where it differs from the release", async () => {
    fetchTracklist.mockResolvedValue(
      tracklist({
        trackCount: 2,
        discCount: 1,
        media: [
          {
            position: 1,
            format: "CD",
            title: null,
            tracks: [
              { number: "1", title: "Ijo Soul", lengthMs: null, artistName: "Tunji Oyelana" },
              { number: "2", title: "House Band", lengthMs: null, artistName: null },
            ],
          },
        ],
      }),
    );
    renderSection({ releaseId: RELEASE });

    expect(await screen.findByText("Tunji Oyelana")).toBeTruthy();
  });

  it("caps a box set and offers the rest on one line", async () => {
    fetchTracklist.mockResolvedValue(
      tracklist({
        trackCount: 120,
        discCount: 8,
        media: Array.from({ length: 8 }, (_, disc) => ({
          position: disc + 1,
          format: "CD",
          title: null,
          tracks: Array.from({ length: 15 }, (_, index) => ({
            number: String(index + 1),
            title: `Disc ${disc + 1} track ${index + 1}`,
            lengthMs: null,
            artistName: null,
          })),
        })),
      }),
    );
    renderSection({ releaseId: RELEASE });

    const more = await screen.findAllByText(/remaining 90/);
    expect(more.length).toBeGreaterThan(0);
    expect(screen.queryByText("Disc 8 track 1")).toBeNull();

    fireEvent.click(more[0].closest("button") as HTMLButtonElement);
    // Not an inner scroll area: the rest expands the sheet, which keeps one scrollbar.
    expect(screen.getByText("Disc 8 track 1")).toBeTruthy();
  });

  it("answers a hand-entered copy without asking the server anything", () => {
    renderSection({ releaseId: "local:5f2b0a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c" });

    expect(screen.getByText(/Typed in by hand/)).toBeTruthy();
    expect(fetchTracklist).not.toHaveBeenCalled();
  });

  it("labels a Discogs pressing as a dead end and keeps its count", async () => {
    fetchTracklist.mockResolvedValue(
      tracklist({ trackCount: 13, discCount: 1, absence: "DISCOGS" }),
    );
    const { container } = renderSection({ releaseId: "discogs:31679120" });

    expect(await screen.findByText(/Matched from Discogs/)).toBeTruthy();
    // The count is the part that is known, and it survives the absence.
    expect(container.textContent).toContain("13 tracks");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a retry when the catalogue did not answer, and nothing else does", async () => {
    fetchTracklist.mockRejectedValue(new Error("gateway"));
    renderSection({ releaseId: RELEASE, trackCount: 26, discCount: 2 });

    const retry = await screen.findByRole("button", { name: "Try again" });
    fetchTracklist.mockResolvedValue(wall());
    fireEvent.click(retry);

    expect(await screen.findByText("Hey You")).toBeTruthy();
  });

  it("states the count it already knew while the titles are still being read", () => {
    fetchTracklist.mockReturnValue(new Promise(() => {}));
    const { container } = renderSection({ releaseId: RELEASE, trackCount: 26, discCount: 2 });

    // 26e: the header is true before the rows are, and the block is sized from it, so
    // nothing below the section moves when the fetch lands a second later.
    expect(container.textContent).toContain("26 tracks");
    expect(container.textContent).toContain("reading catalogue");
  });

  it("is not there at all for a record that names no release", () => {
    const { container } = renderSection({ releaseId: undefined });
    expect(container.textContent).toBe("");
  });

  // The wire's answer for a copy added album-first, and for a wish that names no pressing:
  // an explicit null, not an absent field. It used to slip past the undefined check and be
  // handed to `isManualReleaseId`, whose `startsWith` took down the whole sheet.
  it("is not there for a record whose release arrives as an explicit null", () => {
    const { container } = renderSection({ releaseId: null });
    expect(container.textContent).toBe("");
    expect(fetchTracklist).not.toHaveBeenCalled();
  });
});
