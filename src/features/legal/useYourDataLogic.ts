import { setAccessToken } from "@/api/axios-instance";
import { _export as fetchAccountExport } from "@/api/generated/account/account";
import { deleteAccount } from "@/api/generated/auth/auth";
import { read as readSharing, update as updateSharing } from "@/api/generated/sharing/sharing";
import { toCsv } from "@/domain/csv";
import { useStore } from "@/local/StoreProvider";
import { signedOut } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

/**
 * Screen 17g — every DSGVO right the app can answer by itself.
 *
 * The shape of the answer depends on whether there is an account, and that is the whole
 * design: with one, the server holds a copy and the export is what the *controller* has;
 * without one, there is nothing on the server to ask about, and the export is built from
 * the device's own store. A "download my data" button that silently returned an empty file
 * to somebody with no account would be the wrong kind of correct.
 */
export function useYourDataLogic() {
  const { store } = useStore();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAppSelector((state) => state.auth);
  const signedIn = auth.status === "signedIn";

  const sharing = useQuery({
    queryKey: ["sharing"],
    queryFn: async () => await readSharing(),
    enabled: signedIn,
  });

  const exportJson = useMutation({
    mutationFn: async () => {
      const body = signedIn ? await fetchAccountExport() : await localExport();
      download(
        new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }),
        `rekordo-export-${today()}.json`,
      );
    },
  });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const copies = await store.listCopies();
      const releases = await store.getReleases(copies.map((copy) => copy.releaseId));
      download(
        new Blob([toCsv(copies, releases)], { type: "text/csv;charset=utf-8" }),
        `rekordo-${today()}.csv`,
      );
    },
  });

  /**
   * Art. 7 Abs. 3 in one button: everything the sharing screen can turn off, turned off.
   *
   * It does not touch the lists themselves. Withdrawing consent to be seen is not a request
   * to delete anything, and a control that quietly did both would be the reason nobody dares
   * press it.
   */
  const makePrivate = useMutation({
    mutationFn: async () =>
      updateSharing({
        collectionVisibility: "ONLY_ME",
        wishlistVisibility: "ONLY_ME",
        pricesPublic: false,
        ratingsShared: false,
        findable: false,
      }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(["sharing"], saved);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      await deleteAccount();
      setAccessToken(null);
    },
    onSuccess: async () => {
      dispatch(signedOut());
      // Same reasoning as the account screen: the local collection belongs to the device and
      // stays, but the sync cursor points into a change log that no longer exists.
      await store.writeSyncCursor(0);
      await queryClient.invalidateQueries();
      void navigate({ to: "/" });
    },
  });

  /** What a device with no account has to hand over: its own store, and nothing else. */
  async function localExport() {
    const copies = await store.listCopies();
    const releases = await store.getReleases(copies.map((copy) => copy.releaseId));
    return {
      exportedAt: new Date().toISOString(),
      account: null,
      copies,
      releases: [...releases.values()],
      wishes: await store.listWishlist(),
    };
  }

  return {
    signedIn,
    sharing: sharing.data,
    /** True once nothing is shared with anyone — the button has nothing left to do. */
    alreadyPrivate:
      sharing.data !== undefined &&
      sharing.data.collectionVisibility === "ONLY_ME" &&
      sharing.data.wishlistVisibility === "ONLY_ME" &&
      sharing.data.findable === false &&
      sharing.data.pricesPublic === false &&
      // Nullable on the wire: an account saved before ratings could be shared has never
      // answered this question, and the answer it gets by default is on. Reading that as
      // off would grey this button out on an account that is still showing its stars.
      (sharing.data.ratingsShared ?? true) === false,
    exportJson: () => exportJson.mutate(),
    exportingJson: exportJson.isPending,
    exportJsonFailed: exportJson.isError,
    exportCsv: () => exportCsv.mutate(),
    exportingCsv: exportCsv.isPending,
    makePrivate: () => makePrivate.mutate(),
    makingPrivate: makePrivate.isPending,
    deleteAccount: () => remove.mutate(),
    deleting: remove.isPending,
    deleteFailed: remove.isError,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoked on the next tick: revoking synchronously can beat the download starting in some
  // browsers, and the file arrives empty.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
