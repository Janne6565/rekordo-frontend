import { lookupAlbumCovers, lookupPressingCovers } from "@/api/releases";
import { useWishPhotos } from "@/features/wishlist/useWishPhotos";
import { useStore } from "@/local/StoreProvider";
import { arrangedAt } from "@/local/arrangedAt";
import { readWishlistSort, writeWishlistSort } from "@/local/settings";
import type { WishPatch, WishSort, WishlistItem } from "@janne6565/rekordo-shared";
import {
  applyWishPatch,
  filterWishlist,
  isManualReleaseId,
  manualOrderWrites,
  moveWish,
  sortWishlist,
  tombstonePhoto,
  tombstoneWishlistItem,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

/**
 * The wishlist page (screen 16g) and, through the same hook, the list on mobile.
 *
 * Everything the list can do to an entry lives here: order it, edit it, take it off. What
 * it cannot do is turn one into a copy — "I found a copy" hands over to the add flow with
 * the release filled in, and the entry only leaves once a copy actually exists
 * (`useSatisfyWishes`). Backing out of that flow has to cost nothing.
 */
export function useWishlistLogic() {
  const { store, clock } = useStore();
  const queryClient = useQueryClient();

  const wishlist = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => store.listWishlist(),
  });

  const sortQuery = useQuery({
    queryKey: ["wishlistSort"],
    queryFn: () => readWishlistSort(store),
  });
  const sort: WishSort = sortQuery.data ?? "NEWEST";

  const items = wishlist.data ?? [];
  const ordered = useMemo(() => sortWishlist(items, sort), [items, sort]);

  /**
   * What is typed in the box over the list.
   *
   * Not debounced, unlike the library's: that one re-queries the store and reflows a grid
   * of sleeves, this one is a `filter` over a list already in memory that is two dozen rows
   * at its longest. Making it wait would be inventing a lag to look busy.
   */
  const [search, setSearch] = useState("");

  /**
   * The order a drop just built, held until the store has caught up.
   *
   * Writing a row per entry and re-reading the list is time the row would otherwise spend
   * back where it started — the frame that makes a drop look like it was refused. Applied
   * synchronously when the record is put down, so it lands in the same React commit as the
   * carry clearing itself and the swap is invisible. The shelf holds its drop the same way.
   */
  const [dropped, setDropped] = useState<readonly string[] | null>(null);
  const held = useMemo(() => {
    if (dropped === null) return ordered;
    const byId = new Map(ordered.map((item) => [item.id, item]));
    const seen = new Set(dropped);
    return [
      ...dropped
        .map((id) => byId.get(id))
        .filter((item): item is WishlistItem => item !== undefined),
      ...ordered.filter((item) => !seen.has(item.id)),
    ];
  }, [ordered, dropped]);

  const shown = useMemo(() => filterWishlist(held, search), [held, search]);

  /**
   * The albums on the list, sorted and de-duplicated so the query key is the *set* rather
   * than the order it happens to be shown in — reordering a list must not refetch it.
   */
  const albumIds = useMemo(
    () =>
      [...new Set(items.map((item) => item.albumId))]
        .filter((albumId) => !isManualReleaseId(albumId))
        .sort(),
    [items],
  );

  /**
   * The artwork, which an entry does not carry.
   *
   * A wish is for an album, and an album is an id and a title — the cover belongs to a
   * pressing of it, so the server resolves one. Kept out of the local store deliberately:
   * it is a fact about a catalogue that any client may re-ask for, not part of the
   * collection, and a device offline simply draws the format silhouette instead.
   */
  /**
   * The pictures people uploaded, which any entry may now have.
   *
   * It used to be only the hand-entered half of the list, on the grounds that everything
   * else has a catalogue to ask. It still does — but its answer is one pressing's sleeve
   * among several, and a wish is a note to yourself, so an uploaded picture outranks it.
   */
  const ownPhotos = useWishPhotos(useMemo(() => items.map((item) => item.id), [items]));

  /**
   * The pressings entries were made from, sorted and de-duplicated for the same reason the
   * albums are: the query key is the set, not the order the list happens to be in.
   */
  const releaseIds = useMemo(
    () =>
      [
        ...new Set(
          items
            .map((item) => item.releaseId)
            .filter((releaseId): releaseId is string => releaseId !== null),
        ),
      ]
        .filter((releaseId) => !isManualReleaseId(releaseId))
        .sort(),
    [items],
  );

  const pressingCovers = useQuery({
    queryKey: ["pressingCovers", releaseIds],
    enabled: releaseIds.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: () => lookupPressingCovers(releaseIds),
  });

  const covers = useQuery({
    queryKey: ["albumCovers", albumIds],
    enabled: albumIds.length > 0,
    // The mirror's answer for an album does not move while a list is open.
    staleTime: 60 * 60 * 1000,
    queryFn: () => lookupAlbumCovers(albumIds, store),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
  };

  /**
   * A drag renumbers every entry and switches the list to "Your order".
   *
   * Switching the sort is the point rather than a side effect: dragging a row while the
   * list is ordered by title would otherwise produce a move that the next render undoes,
   * which reads as the app refusing to do what it was just told.
   */
  const reorder = useMutation({
    mutationFn: async ({ next }: { readonly next: readonly WishlistItem[] }) => {
      // One stamp for the whole gesture — see `arrangedAt`, and the shelf, which pays the
      // same cost for the same reason.
      const at = arrangedAt(clock);
      for (const { item, sortIndex } of manualOrderWrites(next)) {
        await store.putWishlistItem(applyWishPatch(item, { sortIndex }, at));
      }
      await writeWishlistSort(store, "MANUAL");
    },
    // `onSettled` rather than `onSuccess`: a write that failed still has to let the held
    // order go, or the list shows a move that never happened until the page is reloaded.
    onSettled: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["wishlistSort"] });
      setDropped(null);
    },
  });

  const edit = useMutation({
    mutationFn: async ({
      item,
      patch,
    }: { readonly item: WishlistItem; readonly patch: WishPatch }) => {
      await store.putWishlistItem(applyWishPatch(item, patch, clock));
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (item: WishlistItem) => {
      const now = Date.now();
      await store.putWishlistItem(tombstoneWishlistItem(item, clock, now));
      // The picture goes with it. A wish id is never reused, so a photo left behind is one
      // nothing can ever reference again — and the server only deletes the object in
      // storage when the record it belongs to is put down.
      const picture = (await store.listWishPhotos([item.id])).get(item.id);
      if (picture !== undefined) await store.putPhoto(tombstonePhoto(picture, clock, now));
    },
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["wish-photos"] });
    },
  });

  return {
    items: shown,
    /** The whole list, which is what the header counts and what "empty" means. */
    count: items.length,
    search,
    handleSearch: useCallback((next: string) => setSearch(next), []),
    /** True while a term is narrowing the list, which several things below hang on. */
    filtering: search.trim() !== "",
    /** A term that names nothing — a different state from a wishlist with nothing on it. */
    noMatches: items.length > 0 && shown.length === 0,
    /**
     * The catalogue's artwork: the sleeve of the pressing this entry was made from, and the
     * album's only when there is no pressing or the mirror has never seen it. Null while
     * either is on its way, and when there is none.
     */
    coverOf: (item: WishlistItem): string | null =>
      (item.releaseId === null ? null : (pressingCovers.data?.get(item.releaseId) ?? null)) ??
      covers.data?.get(item.albumId) ??
      null,
    /**
     * The picture somebody uploaded for this entry.
     *
     * Kept apart from the catalogue's cover rather than folded into it: this one is already
     * on the device, so it paints on the frame it is asked for, and sweeping over it would
     * invent a wait that never happened.
     */
    pictureOf: (item: WishlistItem): string | null => ownPhotos.get(item.id) ?? null,
    loading: wishlist.isLoading,
    sort,
    /** "Your order" is only a thing the menu names once a drag has produced one. */
    reorder: (from: number, to: number) => {
      const next = moveWish(held, from, to);
      setDropped(next.map((item) => item.id));
      reorder.mutate({ next });
    },
    reordering: reorder.isPending,
    edit: (item: WishlistItem, patch: WishPatch) => edit.mutate({ item, patch }),
    remove: (item: WishlistItem) => remove.mutate(item),
    removing: remove.isPending ? remove.variables?.id : undefined,
  };
}
