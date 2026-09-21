import { setAccessToken } from "@/api/axios-instance";
import {
  cancelEmailChange,
  emailConfirmation,
  logout,
  logoutEverywhere,
  resendEmailConfirmation,
  updateProfile,
} from "@/api/generated/auth/auth";
import { read as readSharing } from "@/api/generated/sharing/sharing";
import { lookupAlbumCovers, lookupPressingCovers } from "@/api/releases";
import { toCsv, wishlistToCsv } from "@/domain/csv";
import { useStore } from "@/local/StoreProvider";
import { readPhotoBytes } from "@/local/photoBytes";
import { readLastSyncedAt, readSyncEnabled, writeSyncEnabled } from "@/local/settings";
import { accountChanged, signedOut } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  MC_MIME_TYPE,
  catalogueKeysOf,
  exportMcArchive,
  mcFileName,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

/**
 * The account screen (7a on web, 8b on mobile).
 *
 * Everything destructive here is scoped as narrowly as the wording promises: signing out
 * leaves the local collection alone. The collection belongs to the device, and an account is
 * only ever a way to copy it to other devices.
 *
 * Deleting the account is not here at all -- it lives on Your data (17g) behind the typed
 * confirmation, with the rest of the DSGVO actions.
 */
export function useAccountLogic() {
  const { store } = useStore();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAppSelector((state) => state.auth);

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => store.stats() });

  /** Only for the handle: the picture row says where it is public, and that is the handle. */
  const sharing = useQuery({
    queryKey: ["sharing"],
    queryFn: async () => await readSharing(),
    enabled: auth.status === "signedIn",
  });

  /**
   * The name in the field, or null while it is still just showing the account's.
   *
   * Null rather than a copy of the current name, so the field follows the account until
   * the moment somebody types in it — the silent refresh fills the user in after this
   * screen has already mounted, and a draft seeded at mount would sit there empty.
   */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const accountName = auth.user?.displayName ?? "";

  const rename = useMutation({
    mutationFn: async (next: string) => updateProfile({ displayName: next.trim() }),
    onSuccess: (user) => {
      dispatch(accountChanged(user));
      // Back to following the account, which now says what was just typed.
      setNameDraft(null);
    },
  });

  /**
   * The confirmation row's state (21c), read from the server rather than remembered.
   *
   * "Link sent, good for 24 hours" and the resend countdown are facts about the server; a
   * client that only learned them from its own last button press would forget them the
   * moment the page came back.
   */
  const confirmation = useQuery({
    queryKey: ["emailConfirmation"],
    queryFn: () => emailConfirmation(),
    enabled: auth.status === "signedIn",
  });

  /**
   * A fresh link. Silent about whether there was anything to send -- already confirmed is
   * the state the person wanted rather than an error to report at them -- and inside the
   * first minute the server sends nothing and answers with the seconds left instead.
   */
  const resendConfirmation = useMutation({
    mutationFn: async () => resendEmailConfirmation(),
    onSuccess: (next) => queryClient.setQueryData(["emailConfirmation"], next),
  });

  const cancelChange = useMutation({
    mutationFn: async () => cancelEmailChange(),
    onSuccess: (next) => queryClient.setQueryData(["emailConfirmation"], next),
  });

  /**
   * The countdown on the resend button, ticked here rather than by the server.
   *
   * The server says how many seconds are left when asked; turning that into a number that
   * moves is the screen's job, and re-asking once a second would be a request per tick to
   * learn something arithmetic already knows.
   */
  const [now, setNow] = useState(() => Date.now());
  const sentAt = confirmation.data?.sentAt;
  const retryAfter = confirmation.data?.retryAfter ?? 0;
  useEffect(() => {
    if (sentAt == null || retryAfter === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentAt, retryAfter]);
  const cooldown =
    sentAt == null
      ? 0
      : Math.max(0, Math.ceil((new Date(sentAt).getTime() + retryAfter * 1000 - now) / 1000));

  const syncState = useQuery({
    queryKey: ["syncState"],
    queryFn: async () => ({
      enabled: await readSyncEnabled(store),
      lastSyncedAt: await readLastSyncedAt(store),
    }),
  });

  const setSyncEnabled = useMutation({
    mutationFn: async (enabled: boolean) => writeSyncEnabled(store, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["syncState"] });
    },
  });

  /** Hands a finished file to the browser as a download. */
  const save = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    // Revoked on the next tick: revoking synchronously can beat the download starting
    // in some browsers, and the file arrives empty.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const download = (name: string, text: string) =>
    save(
      `${name}-${new Date().toISOString().slice(0, 10)}.csv`,
      new Blob([text], {
        type: "text/csv;charset=utf-8",
      }),
    );

  /**
   * Builds the file in the browser from the local store — no request, so it works offline
   * and works identically with no account at all.
   */
  const exportCsv = useMutation({
    mutationFn: async () => {
      const copies = await store.listCopies();
      const releases = await store.getReleases(catalogueKeysOf(copies));
      download("rekordo", toCsv(copies, releases));
      return copies.length;
    },
  });

  /**
   * The wishlist as its own file, for the same reason it is its own page: it is a list of
   * records you do not have, and folding it into the collection export would put a row in
   * the spreadsheet for something that is not on the shelf.
   */
  const exportWishlistCsv = useMutation({
    mutationFn: async () => {
      const items = await store.listWishlist();
      download("rekordo-wishlist", wishlistToCsv(items));
      return items.length;
    },
  });

  /**
   * The whole shelf in one file, photographs included.
   *
   * The CSV exports above are for reading; this one is for keeping. A spreadsheet has no
   * column that can hold a photograph, and none that can hold the clocks that make a copy
   * recognisable as *the same copy* when it comes back — so a CSV round-trip necessarily
   * arrives as a pile of new records. The archive carries both, and the two CSVs with them,
   * so the file is still readable by anything years from now.
   *
   * Built from the local store like the others: no request, works offline, works with no
   * account at all.
   */
  const exportArchive = useMutation({
    mutationFn: async () => {
      const exportedAt = new Date();
      const [copies, wishlist] = await Promise.all([store.listCopies(), store.listWishlist()]);
      const releases = await store.getReleases(catalogueKeysOf(copies));
      const archive = await exportMcArchive(
        store,
        { collection: toCsv(copies, releases), wishlist: wishlistToCsv(wishlist) },
        (photoId) => readPhotoBytes(store, photoId),
        exportedAt,
        // The one request an export makes. A wish's cover lives in this deployment's
        // release mirror rather than in the collection, so an archive that did not ask
        // would be complete about everything except the wishlist's pictures — which is
        // exactly what vanishes when the file is imported against a different mirror.
        (albumIds) => lookupAlbumCovers(albumIds),
        // And the sleeves of the pressings those entries were made from, which the covers
        // endpoint cannot answer for: it is asked about albums, and an album has no way of
        // saying which of its pressings was picked.
        (releaseIds) => lookupPressingCovers(releaseIds),
      );
      save(
        mcFileName(exportedAt),
        // A fresh buffer: the archive is a view onto one that Blob would otherwise pin.
        new Blob([archive.bytes.slice().buffer as ArrayBuffer], { type: MC_MIME_TYPE }),
      );
      return archive;
    },
  });

  /**
   * Ending every session, this browser's included.
   *
   * Not best effort, unlike signing out here: somebody asking for this wants the other
   * devices gone, and it may be because one of them is not in their hands any more. So a
   * failure is reported rather than swallowed — but this browser is signed out either way,
   * because staying signed in after pressing it is the one outcome nobody wants.
   */
  const signOutEverywhere = useMutation({
    mutationFn: async () => {
      try {
        await logoutEverywhere();
      } finally {
        setAccessToken(null);
      }
    },
    onSettled: async () => {
      dispatch(signedOut());
      await queryClient.invalidateQueries();
      void navigate({ to: "/" });
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      await logout().catch(() => undefined);
      setAccessToken(null);
    },
    onSuccess: async () => {
      dispatch(signedOut());
      await queryClient.invalidateQueries();
      void navigate({ to: "/" });
    },
  });

  return {
    status: auth.status,
    name: auth.user?.displayName ?? auth.user?.email ?? null,
    /** The account's picture, or null. Null for almost everybody, by design (27a). */
    avatarUrl: auth.user?.avatarUrl ?? null,
    /**
     * The handle the picture is public at, or null while none is claimed.
     *
     * Same query key as the Sharing panel further down the page, so the two share one
     * request rather than asking twice for the same row.
     */
    handle: sharing.data?.handle ?? null,
    /** Told what the account's picture is now, so the header and the chip follow at once. */
    avatarChanged: useCallback(
      (url: string | null) => {
        if (auth.user === null) return;
        dispatch(accountChanged({ ...auth.user, avatarUrl: url ?? undefined }));
      },
      [auth.user, dispatch],
    ),
    /** What the name field shows, which is the account's own name until it is edited. */
    nameDraft: nameDraft ?? accountName,
    editName: useCallback((next: string) => setNameDraft(next), []),
    /** A rename is only offered once it would actually change something. */
    nameChanged: nameDraft !== null && nameDraft.trim() !== accountName,
    saveName: () => rename.mutate(nameDraft ?? accountName),
    savingName: rename.isPending,
    renameFailed: rename.isError,
    email: auth.user?.email ?? null,
    /** Undefined on an account the server has not described yet; treated as confirmed. */
    emailConfirmed: auth.user?.emailVerified !== false,
    /** Set once a link is outstanding, which is what turns the row into its "sent" state. */
    confirmationSentAt: confirmation.data?.sentAt ?? null,
    /** Seconds until the button comes back, or 0 while it is pressable. */
    confirmationCooldown: cooldown,
    resendConfirmation: () => resendConfirmation.mutate(),
    resendingConfirmation: resendConfirmation.isPending,
    /** The address a change is waiting on, or null when none is. */
    pendingEmail: confirmation.data?.pendingEmail ?? null,
    pendingExpiresAt: confirmation.data?.expiresAt ?? null,
    cancelChange: () => cancelChange.mutate(),
    cancellingChange: cancelChange.isPending,
    memberSince: auth.user?.createdAt ?? null,
    stats: stats.data,
    syncEnabled: syncState.data?.enabled ?? true,
    lastSyncedAt: syncState.data?.lastSyncedAt ?? null,
    setSyncEnabled: useCallback(
      (enabled: boolean) => setSyncEnabled.mutate(enabled),
      [setSyncEnabled.mutate],
    ),
    exportCsv: () => exportCsv.mutate(),
    exporting: exportCsv.isPending,
    exportWishlistCsv: () => exportWishlistCsv.mutate(),
    exportingWishlist: exportWishlistCsv.isPending,
    exportArchive: () => exportArchive.mutate(),
    exportingArchive: exportArchive.isPending,
    /** What the last archive held, so the row can say so rather than just going quiet. */
    archiveResult: exportArchive.data,
    archiveFailed: exportArchive.isError,
    signOut: () => signOut.mutate(),
    signingOut: signOut.isPending,
    signOutEverywhere: () => signOutEverywhere.mutate(),
    signingOutEverywhere: signOutEverywhere.isPending,
    signOutEverywhereFailed: signOutEverywhere.isError,
  };
}
