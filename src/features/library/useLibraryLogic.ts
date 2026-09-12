import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { useStore } from "@/local/StoreProvider";
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
  hasArrangedOrder,
  libraryOrderWrites,
  moveCopy,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [sort, setSort] = useState<SortKey>("ADDED_DESC");
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
    queryKey: ["copies", format, searchTerm, sort],
    queryFn: async () => {
      const copies = await store.listCopies({ format, search: searchTerm, sort });
      const releases = await store.getReleases(copies.map((copy) => copy.releaseId));
      return copies.map((copy) => ({ copy, release: releases.get(copy.releaseId) }));
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
   * Renumbers the shelf *as it was on screen* and switches the order to `MANUAL` in one
   * go. Switching is the point rather than a side effect: the order you were looking at
   * when you picked a record up is the order you meant to adjust, so dragging on a shelf
   * sorted by artist keeps that arrangement and moves one record within it.
   *
   * The drop is held until the store has caught up — writing a row per record and
   * re-reading the shelf is time the tile would otherwise spend back where it started.
   */
  const [dropped, setDropped] = useState<readonly string[] | null>(null);
  const arrange = useMutation({
    mutationFn: async ({ from, to }: { readonly from: number; readonly to: number }) => {
      const next = moveCopy(rows, from, to);
      setDropped(next.map((row) => row.copy.id));
      await store.putCopies(
        libraryOrderWrites(next.map((row) => row.copy)).map(({ copy, sortIndex }) =>
          applyCopyPatch(copy, { sortIndex }, clock),
        ),
      );
      setSort("MANUAL");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["copies"] });
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
  const cycleSort = useCallback(() => {
    setSort((current) =>
      current === "ADDED_DESC"
        ? "ARTIST_ASC"
        : current === "ARTIST_ASC"
          ? "YEAR_DESC"
          : "ADDED_DESC",
    );
  }, []);

  return {
    rows: shown,
    stats,
    loading: copiesQuery.isLoading,
    failed: copiesQuery.isError,
    /** True only when the collection itself is empty, not when a filter excludes everything. */
    collectionEmpty: stats !== undefined && stats.copyCount === 0,
    format,
    search,
    sort,
    handleFormat,
    handleSearch,
    cycleSort,
    /** 24b: the phone picks a mode from a sheet rather than cycling through three. */
    setSort,
    /** Whether "Your order" is a thing the controls can offer yet. */
    arranged: useMemo(() => hasArrangedOrder(all.map((row) => row.copy)), [all]),
    arrange: useCallback(
      (from: number, to: number) => {
        arrange.mutate({ from, to });
      },
      [arrange],
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
