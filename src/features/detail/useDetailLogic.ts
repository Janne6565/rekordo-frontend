import { lookupRelease } from "@/api/releases";
import { useUndo } from "@/features/detail/UndoDelete";
import { markBackNavigation } from "@/lib/motion";
import { useStore } from "@/local/StoreProvider";
import type { Copy, CopyDraft, Release } from "@janne6565/rekordo-shared";
import {
  DURATION,
  applyCopyPatch,
  catalogueKeyOf,
  catalogueKeysOf,
  tombstoneCopy,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

export interface DetailData {
  readonly copy: Copy;
  readonly release: Release | undefined;
  readonly otherCopies: readonly { copy: Copy; release: Release | undefined }[];
}

export function useDetailLogic(copyId: string) {
  const { offer: offerUndo } = useUndo();
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  /**
   * Everything the page draws, read from the local store alone.
   *
   * Nothing in here touches the network. The app is local-first: a copy that exists on this
   * device has all of its metadata on this device too, so opening it must be as fast as an
   * IndexedDB read — which is what it was not while the cover theme was fetched inline.
   */
  const detailQuery = useQuery<DetailData | null>({
    queryKey: ["copy", copyId],
    queryFn: async () => {
      const copy = await store.getCopy(copyId);
      if (copy === undefined) return null;

      const key = catalogueKeyOf(copy);
      const release = key === null ? undefined : await store.getRelease(key);
      const siblings =
        release === undefined ? [] : await store.listCopiesInReleaseGroup(release.albumId);
      const releases = await store.getReleases(catalogueKeysOf(siblings));

      return {
        copy,
        release,
        otherCopies: siblings
          .filter((sibling) => sibling.id !== copy.id)
          .map((sibling) => ({
            copy: sibling,
            release: releases.get(catalogueKeyOf(sibling) ?? ""),
          })),
      };
    },
  });

  const release = detailQuery.data?.release;
  useReleaseEnrichment(release);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["copy", copyId] });
    await queryClient.invalidateQueries({ queryKey: ["copies"] });
    await queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const save = useMutation({
    mutationFn: async (patch: Partial<CopyDraft>) => {
      const copy = await store.getCopy(copyId);
      if (copy === undefined) return;
      await store.putCopy(applyCopyPatch(copy, patch, clock));
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const copy = await store.getCopy(copyId);
      if (copy === undefined) return;
      await store.putCopy(tombstoneCopy(copy, clock, Date.now()));
    },
    onSuccess: async () => {
      await invalidate();
      /*
       * One gesture, sequenced (turn 13h). The dialog takes its 120ms exit and the route
       * starts crossing 30ms before it is gone, so the two read as one movement rather
       * than as two things that happened to fire together. The write itself is already
       * done — none of this is a wait.
       */
      window.setTimeout(() => {
        markBackNavigation();
        void navigate({ to: "/", viewTransition: true });
        offerUndo({ kind: "COPY", copyId });
      }, DURATION.quick - 30);
    },
  });

  return {
    data: detailQuery.data ?? null,
    loading: detailQuery.isLoading,
    save: (patch: Partial<CopyDraft>) => save.mutate(patch),
    saving: save.isPending,
    remove: () => remove.mutate(),
    removing: remove.isPending,
  };
}

/**
 * Fills in what a release's search result did not carry, in the background, once.
 *
 * A search returns a summary; the label, catalogue number and country this page prints
 * under the title come from the full lookup. `coverTheme === null` is the marker for
 * "summary only" — the palette is sampled server-side on that lookup alone, so its absence
 * is exactly the question "has this release ever been looked up properly". Web no longer
 * draws the palette itself (see DetailPage), but it remains the cheapest signal there is,
 * and the mobile app does draw it.
 *
 * Beside the page rather than in front of it: the round trip can take seconds on a cover
 * the server has never sampled, and nothing it brings back is worth making a local-first
 * page wait.
 *
 * `staleTime: Infinity` is what keeps it to once: a release whose cover genuinely has no
 * palette still comes back with a null theme, and without this every reopen would ask again.
 */
export function useReleaseEnrichment(release: Release | undefined): void {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const summaryOnly = release !== undefined && release.coverTheme === null;

  useQuery({
    queryKey: ["coverTheme", release?.id],
    enabled: summaryOnly,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async () => {
      if (release === undefined) return null;
      const enriched = await lookupRelease(release.id).catch(() => null);
      if (enriched === null || enriched.coverTheme === null) return null;
      await store.cacheReleases([enriched]);
      // Only now, and only when something actually changed, does the page re-read.
      await queryClient.invalidateQueries({ queryKey: ["copy"] });
      return enriched;
    },
  });
}
