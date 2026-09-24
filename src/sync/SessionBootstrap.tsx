import { setAccessToken, setRefreshHandler } from "@/api/axios-instance";
import { refresh } from "@/api/generated/auth/auth";
import { useStore } from "@/local/StoreProvider";
import { readSyncEnabled, writeLastSyncedAt } from "@/local/settings";
import { signedIn, signedOut } from "@/store/authSlice";
import { firstPullFinished, firstPullPage, firstPullStarted } from "@/store/firstPullSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { announcePush, onPushElsewhere } from "@/sync/pushBroadcast";
import { readSyncStart } from "@/sync/syncStart";
import { createSyncEngine } from "@/sync/transport";
import { useSyncLoop } from "@janne6565/rekordo-shared";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";

/**
 * How often a signed-in tab reconciles with the server while it is open.
 *
 * The fallback, not the path an edit takes: a local write is pushed a moment after it lands
 * (see `useSyncLoop`). This is what brings in changes made on other devices.
 */
const SYNC_INTERVAL_MS = 60_000;

/**
 * Restores the session from the refresh cookie on load, then keeps a signed-in tab in sync.
 *
 * Renders its children immediately and never blocks on the network: the app works with no
 * account and no connection, so making the first paint wait on a refresh call would make
 * the offline case worse than the online one for no reason.
 */
export function SessionBootstrap({ children }: { readonly children: ReactNode }) {
  const dispatch = useAppDispatch();
  const { store, clock, localWrites } = useStore();
  const queryClient = useQueryClient();
  const auth = useAppSelector((state) => state.auth);

  useEffect(() => {
    // Lets a 401 on any call attempt one silent refresh before surfacing as an error.
    setRefreshHandler(async () => {
      try {
        const session = await refresh();
        if (session.accessToken === undefined) return null;
        setAccessToken(session.accessToken);
        return session.accessToken;
      } catch {
        return null;
      }
    });
    return () => setRefreshHandler(null);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const session = await refresh();
        if (session.accessToken == null || session.user == null) {
          dispatch(signedOut());
          return;
        }
        setAccessToken(session.accessToken);
        const { firstSyncPending, awaitingFirstPull } = await readSyncStart(store);
        // Before `signedIn`, for the same reason as on the sign-in form: a provider sign-in
        // arrives here, and its first frame of library must not say the shelf is empty.
        if (awaitingFirstPull) dispatch(firstPullStarted());
        dispatch(signedIn({ user: session.user, firstSyncPending }));
      } catch {
        // No cookie, or the server is unreachable. Either way the app runs anonymously,
        // which is a fully supported state rather than an error.
        dispatch(signedOut());
      }
    })();
  }, [dispatch, store]);

  const active = auth.status === "signedIn" && !auth.firstSyncPending;

  // Every pass reports its pages; the slice only listens while a first pull is waiting.
  const engine = useMemo(
    () =>
      createSyncEngine(store, clock, {
        onPage: (page) =>
          dispatch(
            firstPullPage({
              copies: page.copies.filter((copy) => copy.deletedAt === null).length,
              wishes: page.wishes.filter((wish) => wish.deletedAt === null).length,
              last: !page.hasMore,
            }),
          ),
      }),
    [store, clock, dispatch],
  );

  // Never two at once: the loop serialises passes, so this no longer guards itself.
  const run = useCallback(async () => {
    // Read every pass rather than once: the account screen can switch this off while the
    // loop is already running, and it should take effect on the next pass, not the next
    // reload.
    if (!(await readSyncEnabled(store))) {
      dispatch(firstPullFinished());
      return;
    }
    try {
      const result = await engine.sync();
      await writeLastSyncedAt(store, Date.now());
      // `releases` counts separately on purpose: a tab that pulled its collection before
      // the client fetched any catalogue has nothing new to pull and a whole shelf of
      // untitled placeholders to redraw. A pass that moved nothing invalidates nothing.
      if (result.pulled > 0 || result.pushed > 0 || result.releases > 0) {
        await queryClient.invalidateQueries();
      }
      // The public profile is the server's view of this shelf, so it only changes once a
      // push lands -- and another tab showing it has its own cache that this one cannot
      // reach. Hiding a copy from others and switching to your /@handle tab has to show it
      // gone.
      if (result.pushed > 0) announcePush();
    } catch {
      // Offline, or the server is down. The next pass tries again; nothing is lost because
      // every local change is still recorded as pending.
    } finally {
      // Failed or not, loading 1b lets go here: the next tick is a minute away, and a
      // screen that waits on it has no end the person can see.
      dispatch(firstPullFinished());
    }
  }, [engine, store, queryClient, dispatch]);

  // A pass on start, one a moment after every local edit, and the interval as the fallback.
  const { flush } = useSyncLoop({ active, run, localWrites, intervalMs: SYNC_INTERVAL_MS });

  useEffect(() => {
    if (!active) return;
    // An edit made just before switching away still goes up now rather than waiting for a
    // tab the browser may throttle or never bring back.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, flush]);

  useEffect(
    () =>
      onPushElsewhere(() => {
        void queryClient.invalidateQueries({ queryKey: ["profile"] });
      }),
    [queryClient],
  );

  return <>{children}</>;
}
