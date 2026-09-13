import { useStore } from "@/local/StoreProvider";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

/**
 * Each copy's own photo, as something an `<img>` can show.
 *
 * The library grid needs the same standing-in the detail hero does: a release the Cover
 * Art Archive never had still looks like a record on the shelf if its owner photographed
 * it. Only copies that actually have a photo cost anything — the ids come back from one
 * indexed query, and the bytes are read for those alone.
 */
export function useCoverPhotos(copyIds: readonly string[]): ReadonlyMap<string, string> {
  const { store } = useStore();
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());

  /**
   * The copies on screen as a *set*: sorted and de-duplicated, then joined for the key.
   *
   * Sorting is the whole point, and the joining alone used to be it. The key was the ids
   * in the order the shelf happened to be in, so arranging the shelf by hand made it a
   * different query — and this one does not merely refetch. A new `photos.data` re-runs
   * the effect below, whose cleanup revokes every object URL it made, so each `<img>` had
   * its src pulled out from under it and genuinely reloaded. A drag changes the order and
   * never the set, so with the set as the key nothing happens at all.
   */
  const ids = useMemo(() => [...new Set(copyIds)].sort(), [copyIds]);
  const key = ids.join(",");

  const photos = useQuery({
    queryKey: ["cover-photos", key],
    queryFn: () => store.listCoverPhotos(ids),
  });

  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];

    void (async () => {
      const built = new Map<string, string>();
      for (const [copyId, photo] of photos.data ?? []) {
        const bytes = await store.getPhotoBytes(photo.id);
        if (bytes === undefined) continue;
        const url = URL.createObjectURL(bytes);
        made.push(url);
        built.set(copyId, url);
      }
      if (cancelled) return;
      setUrls(built);
    })();

    return () => {
      cancelled = true;
      // Object URLs pin their blob until revoked; a grid that re-ran on every filter
      // change would hold every photo the shelf has ever shown.
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [photos.data, store]);

  return urls;
}
