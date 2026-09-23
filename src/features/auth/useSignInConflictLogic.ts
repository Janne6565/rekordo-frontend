import { useStore } from "@/local/StoreProvider";
import { firstSyncResolved, syncOutcomeRecorded } from "@/store/authSlice";
import { useAppDispatch } from "@/store/hooks";
import { createSyncEngine } from "@/sync/transport";
import {
  type OneSidedEntry,
  type ReviewPlan,
  type ShelfComparison,
  type ShelfSide,
  decidedCount,
  differenceKey,
  dropped,
  mergedCopies,
  mergedWishes,
  reviewedCopies,
  reviewedWishes,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Which of the flow's screens is on top.
 *
 * One value rather than several booleans: "the difference is open" and "the review is
 * open" are answers to the same question, and as flags they could both be true — a state
 * nobody chose and every renderer would then have to break a tie about.
 */
export type ConflictView =
  /** Reading the account. Nothing has been written and nothing can be answered yet. */
  | "COMPARING"
  /** The account could not be read at all. Not a question, so it does not block. */
  | "UNREACHABLE"
  /** The account was empty: no dialogue, just the collection going up. */
  | "UPLOADING"
  /** One side contained the other. A confirmation with one button. */
  | "NO_LOSS"
  /** Both sides changed. The blocking question. */
  | "CONFLICT"
  /** The itemised difference, on top of the question rather than instead of it. */
  | "DIFFERENCE"
  /** The per-item review. */
  | "REVIEW"
  /** Confirming one of the two choices that deletes something. */
  | "DROP";

/** What the library says happened, once the dialogue is gone. */
export type ConflictResolution = "MERGED" | "KEPT_LOCAL" | "KEPT_ACCOUNT" | "REVIEWED";

/**
 * The sign-in conflict, end to end (turn 29).
 *
 * The shape of the flow is the design's argument: the comparison happens before anything
 * is written, most sign-ins never become a question at all, and the one that does blocks
 * until it is answered because every way out of it is a decision about somebody's records.
 */
export function useSignInConflictLogic() {
  const { store, clock } = useStore();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [view, setView] = useState<ConflictView | null>(null);
  const [pendingKeep, setPendingKeep] = useState<ShelfSide | null>(null);
  const [plan, setPlan] = useState<ReviewPlan>({ picks: {}, dropped: [] });

  /**
   * How many copies this device holds, known before the account has answered.
   *
   * Asked separately so the waiting screen is not an empty progress bar: half of what it
   * is comparing is already on this machine, and saying so is the difference between a
   * wait and a stall.
   */
  const localCount = useQuery({
    queryKey: ["signInConflict", "local"],
    queryFn: async () => (await store.listCopies()).length,
  });

  const comparison = useQuery({
    queryKey: ["signInConflict", "comparison"],
    queryFn: () => createSyncEngine(store, clock).compare(),
    // A comparison is a photograph of a moment. Retaking it behind the dialogue would
    // change the numbers somebody is reading and, worse, the answer they are about to give.
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const resolve = useMutation({
    mutationFn: async ({
      resolution,
      run,
    }: {
      readonly resolution: ConflictResolution;
      readonly run: () => Promise<unknown>;
    }) => {
      await run();
      return resolution;
    },
    onSuccess: async (resolution) => {
      dispatch(syncOutcomeRecorded(outcomeOf(resolution, comparison.data, plan)));
      dispatch(firstSyncResolved());
      await queryClient.invalidateQueries();
      void navigate({ to: "/" });
    },
  });

  const engine = useCallback(() => createSyncEngine(store, clock), [store, clock]);

  const choose = useCallback(
    (resolution: ConflictResolution, run: () => Promise<unknown>) =>
      resolve.mutate({ resolution, run }),
    [resolve],
  );

  const keepBoth = useCallback(
    () => choose("MERGED", () => engine().firstSync("MERGE")),
    [choose, engine],
  );

  const confirmKeep = useCallback(() => {
    if (pendingKeep === null) return;
    const side = pendingKeep;
    choose(side === "LOCAL" ? "KEPT_LOCAL" : "KEPT_ACCOUNT", () =>
      engine().firstSync(side === "LOCAL" ? "KEEP_LOCAL" : "KEEP_ACCOUNT"),
    );
  }, [choose, engine, pendingKeep]);

  const applyReview = useCallback(() => {
    const data = comparison.data;
    if (data === undefined) return;
    choose("REVIEWED", () => engine().firstSyncReviewed(data, plan));
  }, [choose, comparison.data, engine, plan]);

  /**
   * The view, derived rather than stored wherever it can be.
   *
   * `view` only ever holds a screen somebody *opened*. Which screen the flow starts on is
   * a fact about the comparison, and keeping that in state as well would let the two
   * disagree — the classic version of that bug being a dialogue that keeps asking a
   * question the data no longer poses.
   */
  const current: ConflictView = useMemo(() => {
    if (view !== null) return view;
    if (comparison.isPending) return "COMPARING";
    if (comparison.isError) return "UNREACHABLE";
    const outcome = comparison.data?.outcome;
    if (outcome === "EMPTY_ACCOUNT") return "UPLOADING";
    if (outcome === "NO_LOSS") return "NO_LOSS";
    return "CONFLICT";
  }, [comparison.data?.outcome, comparison.isError, comparison.isPending, view]);

  /**
   * The empty-account case answers itself.
   *
   * There is no question here — nothing on the far side to weigh anything against — so the
   * upload starts on its own and the screen is a statement, not a prompt.
   *
   * Once, from `idle` only: a *failed* upload used to count as idle too and restarted
   * itself on the next render, so the retry never stayed on screen and the bar ran forever.
   */
  const idle = resolve.isIdle;
  useEffect(() => {
    if (current === "UPLOADING" && idle) keepBoth();
  }, [current, idle, keepBoth]);

  const pick = useCallback((key: string, side: ShelfSide) => {
    setPlan((current) => ({ ...current, picks: { ...current.picks, [key]: side } }));
  }, []);

  const setDropped = useCallback((id: string, drop: boolean) => {
    setPlan((current) => ({
      ...current,
      dropped: drop
        ? [...new Set([...current.dropped, id])]
        : current.dropped.filter((other) => other !== id),
    }));
  }, []);

  /** "Keep all": every one-sided entry stays, and the values keep the merge's answer. */
  const keepAll = useCallback(() => setPlan((current) => ({ ...current, dropped: [] })), []);

  const data = comparison.data;

  return {
    view: current,
    comparison: data,
    localCount: localCount.data ?? 0,
    working: resolve.isPending,
    failed: resolve.isError,
    plan,

    /** 29b's three buttons, and the totals each of them promises. */
    mergedCopies: data === undefined ? 0 : mergedCopies(data),
    mergedWishes: data === undefined ? 0 : mergedWishes(data),

    /** 29d's running answer to "what will I end up with". */
    reviewedCopies: data === undefined ? 0 : reviewedCopies(data, plan),
    reviewedWishes: data === undefined ? 0 : reviewedWishes(data, plan),
    decided: data === undefined ? 0 : decidedCount(data, plan),

    pendingKeep,
    droppedBy: (side: ShelfSide): readonly OneSidedEntry[] =>
      data === undefined ? [] : dropped(data, side),

    openDifference: () => setView("DIFFERENCE"),
    openReview: () => setView("REVIEW"),
    askKeep: (side: ShelfSide) => {
      setPendingKeep(side);
      setView("DROP");
    },
    /** Every way back lands on the question, which is the only screen that must be answered. */
    back: () => {
      setPendingKeep(null);
      setView(null);
    },
    retry: () => void comparison.refetch(),
    /**
     * The offered export, never the forced one.
     *
     * Written from the difference rather than from the store, because half of what is
     * about to be dropped is only in the account and this device has no record of it. Four
     * columns and a side, which is what somebody looking for a record they lost actually
     * needs to search for it again.
     */
    exportDropped: () => {
      if (pendingKeep === null || data === undefined) return;
      downloadCsv(dropped(data, pendingKeep));
    },
    /** The one non-blocking exit: the account could not be read, so nothing is being asked. */
    dismissUnreachable: () => {
      dispatch(firstSyncResolved());
      void navigate({ to: "/" });
    },

    keepBoth,
    confirmKeep,
    applyReview,
    pick,
    setDropped,
    keepAll,
    pickedSide: (key: string): ShelfSide | undefined => plan.picks[key],
    isDropped: (id: string): boolean => plan.dropped.includes(id),
  };
}

/** The entries a keep would throw away, as a file. */
function downloadCsv(entries: readonly OneSidedEntry[]): void {
  const rows = [
    ["title", "artist", "year", "format", "kind", "side"],
    ...entries.map((entry) => [
      entry.title ?? "",
      entry.artistName ?? "",
      entry.year === null ? "" : String(entry.year),
      entry.format,
      entry.kind,
      entry.side,
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rekordo-dropped-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** What the library's one line will say, computed while the comparison is still in hand. */
function outcomeOf(
  resolution: ConflictResolution,
  comparison: ShelfComparison | undefined,
  plan: ReviewPlan,
) {
  if (comparison === undefined) return null;
  const kept = [...comparison.onlyLocal, ...comparison.onlyAccount].filter(
    (entry) => !plan.dropped.includes(entry.id),
  );
  const arrived =
    resolution === "KEPT_LOCAL"
      ? []
      : comparison.onlyAccount.filter((entry) => resolution !== "REVIEWED" || kept.includes(entry));
  return {
    resolution,
    arrived: arrived.length,
    edits: resolution === "KEPT_LOCAL" ? 0 : comparison.values.length,
    // The ids are what "Show them" filters the shelf down to. Only copies: the library is
    // a shelf, and a wishlist entry has no tile there to reveal.
    ids: arrived.filter((entry) => entry.kind === "COPY").map((entry) => entry.id),
  };
}

export { differenceKey };
