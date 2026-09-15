import { setAccessToken, setRefreshHandler } from "@/api/axios-instance";
import { refresh } from "@/api/generated/auth/auth";
import { useStore } from "@/local/StoreProvider";
import { readSyncEnabled, writeLastSyncedAt } from "@/local/settings";
import { signedIn, signedOut } from "@/store/authSlice";
import { firstPullFinished, firstPullPage, firstPullStarted } from "@/store/firstPullSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { readSyncStart } from "@/sync/syncStart";
import { createSyncEngine } from "@/sync/transport";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";

/** How often a signed-in tab reconciles with the server while it is open. */
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
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const auth = useAppSelector((state) => state.auth);
  const syncing = useRef(false);

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

  useEffect(() => {
    if (auth.status !== "signedIn" || auth.firstSyncPending) return;

    // Every tick reports its pages; the slice only listens while a first pull is waiting.
    const engine = createSyncEngine(store, clock, {
      onPage: (page) =>
        dispatch(
          firstPullPage({
            copies: page.copies.filter((copy) => copy.deletedAt === null).length,
            wishes: page.wishes.filter((wish) => wish.deletedAt === null).length,
            last: !page.hasMore,
          }),
        ),
    });
    const run = async () => {
      // A slow sync must not stack up behind itself on a flaky connection.
      if (syncing.current) return;
      // Read every tick rather than once: the account screen can switch this off while the
      // interval is already running, and it should take effect on the next tick, not the
      // next reload.
      if (!(await readSyncEnabled(store))) {
        dispatch(firstPullFinished());
        return;
      }
      syncing.current = true;
      try {
        const result = await engine.sync();
        await writeLastSyncedAt(store, Date.now());
        // `releases` counts separately on purpose: a tab that pulled its collection before
        // the client fetched any catalogue has nothing new to pull and a whole shelf of
        // untitled placeholders to redraw.
        if (result.pulled > 0 || result.pushed > 0 || result.releases > 0) {
          await queryClient.invalidateQueries();
        }
      } catch {
        // Offline, or the server is down. The next tick tries again; nothing is lost
        // because every local change is still recorded as pending.
      } finally {
        syncing.current = false;
        // Failed or not, loading 1b lets go here: the next tick is a minute away, and a
        // screen that waits on it has no end the person can see.
        dispatch(firstPullFinished());
      }
    };

    void run();
    const timer = setInterval(() => void run(), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [auth.status, auth.firstSyncPending, store, clock, queryClient, dispatch]);

  return <>{children}</>;
}
