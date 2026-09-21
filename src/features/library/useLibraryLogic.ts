import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { useStore } from "@/local/StoreProvider";
import { arrangedAt } from "@/local/arrangedAt";
import { syncOutcomeCleared } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type {
  CollectionStats,
  Copy,
  Format,
  LibraryFilter,
  Release,
} from "@janne6565/rekordo-shared";
import {
  applyCopyPatch,
  catalogueKeyOf,
  catalogueKeysOf,
  hasArrangedOrder,
  libraryOrderWrites,
  moveCopy,
} from "@janne6565/rekordo-shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

export type FormatFilter = Format | "ALL";
export type SortKey = NonNullable<LibraryFilter["sort"]>;

/**
 * How long the search box has to stand still before the grid re-queries.
 *
 * The query is local, so the cost is not a request — it is that every keystroke re-sorted
 * and re-rendered the whole grid, and a shelf reflowing under each letter is hard to read
 * while you are still typing the word. Shorter than the add dialog's 350ms, which is
 * pacing an upstream call; this one only has to outlast the gap between two keystrokes.
 */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The shelf is always read in the order somebody arranged it.
 *
 * Not a choice held in state: there is no sort control any more, so the only two orders a
 * shelf can be in are newest-first and "yours" — and `MANUAL` over a shelf nobody has
 * arranged *is* newest-first, because every unplaced copy sorts newest first. Holding it
 * in `useState` instead reset to newest-first on every mount, so an arranged shelf lost
 * its order on a reload, on coming back from a record, and on any browser that had never
 * dragged but pulled the arrangement from another device.
 */
const SHELF_ORDER: SortKey = "MANUAL";

export interface LibraryRow {
  readonly copy: Copy;
  readonly release: Release | undefined;
}

/**
 * Just the sidebar's counts.
 *
 * The shell is on every page, but only the library needs the grid behind it. Splitting the
 * stats query out keeps the detail and wishlist pages from loading a whole collection to
 * put four numbers in the sidebar.
 */
export function useCollectionStats(): CollectionStats | undefined {
  const { store } = useStore();
  return useQuery({ queryKey: ["stats"], queryFn: () => store.stats() }).data;
}

export function useLibraryLogic() {
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<FormatFilter>("ALL");
  const [search, setSearch] = useState("");
  /**
   * 29e-5: the shelf filtered down to the records the sign-in brought in.
   *
   * Held here rather than in the URL because it is not a place — it is the second half of
   * a sentence the banner is still saying, and it goes away with the banner.
   */
  const [showingArrived, setShowingArrived] = useState(false);
  const dispatch = useAppDispatch();
  const outcome = useAppSelector((state) => state.auth.syncOutcome);

  /** What the grid is filtered by — the box stays instant, this trails it. */
  const searchTerm = useDebouncedSearch(search, SEARCH_DEBOUNCE_MS);

  const stats = useCollectionStats();

  const copiesQuery = useQuery({
    queryKey: ["copies", format, searchTerm, SHELF_ORDER],
    /**
     * A shelf already on screen stays there while the next one is read.
     *
     * A format chip or a search term is part of the key, so without this the grid blanks
     * until the new read comes back instead of changing in place.
     */
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const copies = await store.listCopies({ format, search: searchTerm, sort: SHELF_ORDER });
      const releases = await store.getReleases(catalogueKeysOf(copies));
      return copies.map((copy) => ({ copy, release: releases.get(catalogueKeyOf(copy) ?? "") }));
    },
  });

  const all = useMemo<LibraryRow[]>(() => copiesQuery.data ?? [], [copiesQuery.data]);
  const rows = useMemo<LibraryRow[]>(() => {
    if (!showingArrived || outcome === null) return all;
    const arrived = new Set(outcome.ids);
    return all.filter((row) => arrived.has(row.copy.id));
  }, [all, outcome, showingArrived]);

  /**
   * A record set down somewhere else.
   *
   * Renumbers the shelf *as it was on screen*: the order you were looking at when you picked
   * a record up is the order you meant to adjust.
   *
   * The drop is held until the store has caught up — writing a row per record and
   * re-reading the shelf is time the tile would otherwise spend back where it started.
   */
  const [dropped, setDropped] = useState<readonly string[] | null>(null);
  const arrange = useMutation({
    mutationFn: async ({ next }: { readonly next: readonly LibraryRow[] }) => {
      // One stamp for the whole gesture — see `arrangedAt`.
      const at = arrangedAt(clock);
      await store.putCopies(
        libraryOrderWrites(next.map((row) => row.copy)).map(({ copy, sortIndex }) =>
          applyCopyPatch(copy, { sortIndex }, at),
        ),
      );
    },
    /**
     * The held order is let go only once the shelf has actually been re-read.
     *
     * `refetchQueries` rather than `invalidateQueries`, because invalidating resolves
     * without waiting for the fetch it starts. Released too early, the grid falls back to
     * what the query is holding — the order from before the drag. Measured at 149ms,
     * between a correct 61ms and a correct 185ms, which is exactly the flicker somebody sees.
     */
    onSettled: async () => {
      await queryClient.refetchQueries({ queryKey: ["copies"], type: "active" });
      setDropped(null);
    },
  });

  /** What the grid actually draws: the held order while a drop settles, else the query's. */
  const shown = useMemo<LibraryRow[]>(() => {
    if (dropped === null) return rows;
    const byId = new Map(rows.map((row) => [row.copy.id, row]));
    const seen = new Set(dropped);
    return [
      ...dropped.map((id) => byId.get(id)).filter((row): row is LibraryRow => row !== undefined),
      ...rows.filter((row) => !seen.has(row.copy.id)),
    ];
  }, [rows, dropped]);

  const handleFormat = useCallback((next: FormatFilter) => setFormat(next), []);
  const handleSearch = useCallback((next: string) => setSearch(next), []);

  return {
    rows: shown,
    stats,
    loading: copiesQuery.isLoading,
    failed: copiesQuery.isError,
    /** True only when the collection itself is empty, not when a filter excludes everything. */
    collectionEmpty: stats !== undefined && stats.copyCount === 0,
    format,
    search,
    handleFormat,
    handleSearch,
    /** Whether any record on the shelf has been placed by hand yet. */
    arranged: useMemo(() => hasArrangedOrder(all.map((row) => row.copy)), [all]),
    /**
     * The held order is applied *here*, synchronously, and not inside the mutation.
     *
     * This runs while the record is being put down and the carry is clearing itself, so
     * both land in one React commit and the swap is invisible. Set inside `mutationFn`
     * instead it is a later commit, and the shelf shows the old order in between: the
     * record blinks back to where it came from and the row flashes. Only the order is
     * synchronous; the write behind it is not.
     */
    arrange: useCallback(
      (from: number, to: number) => {
        const next = moveCopy(rows, from, to);
        setDropped(next.map((row) => row.copy.id));
        arrange.mutate({ next });
      },
      [arrange, rows],
    ),
    /**
     * Whether a record may be picked up at all — the whole shelf, or none of it. A
     * position in a narrowed shelf means nothing in the whole one.
     */
    arrangeable:
      format === "ALL" && searchTerm.trim() === "" && !(showingArrived && outcome !== null),

    /** What the sign-in resolved to, until it has been read once. */
    outcome,
    showingArrived,
    showArrived: () => setShowingArrived(true),
    dismissOutcome: () => {
      setShowingArrived(false);
      dispatch(syncOutcomeCleared());
    },
  };
}
