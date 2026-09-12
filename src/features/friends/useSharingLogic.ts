import { availability, claim } from "@/api/generated/handles/handles";
import type {
  SharingSettingsDto,
  SharingSettingsDtoCollectionVisibility,
} from "@/api/generated/rekordoAPI.schemas";
import { read, update } from "@/api/generated/sharing/sharing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

/** The Sharing screen, 15f. Three lists, three separate answers, plus the handle. */
export function useSharingLogic() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["sharing"],
    queryFn: async () => await read(),
  });

  const save = useMutation({
    mutationFn: async (next: SharingSettingsDto) =>
      update({
        collectionVisibility: next.collectionVisibility ?? "FRIENDS",
        wishlistVisibility: next.wishlistVisibility ?? "FRIENDS",
        pricesPublic: next.pricesPublic ?? false,
        // Matches the server's default. `?? false` here would mean that touching any other
        // switch, on a settings object that arrived without this field, quietly turned the
        // stars off.
        ratingsShared: next.ratingsShared ?? true,
        findable: next.findable ?? true,
      }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(["sharing"], saved);
      // A shelf that just closed has to stop showing on every profile the page has cached,
      // including the viewer's own.
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });

  /**
   * Saved on change rather than behind a Save button.
   *
   * Every control here is a single answer to a single question, and a privacy screen with
   * unsaved state is one where somebody can close the tab believing they turned something
   * off. The whole record is sent each time because the endpoint takes every answer at once.
   */
  const set = useCallback(
    (patch: Partial<SharingSettingsDto>) => {
      if (!settings.data) return;
      save.mutate({ ...settings.data, ...patch });
    },
    [settings.data, save],
  );

  return {
    settings: settings.data,
    loading: settings.isLoading,
    saving: save.isPending,
    set,
    setCollection: (value: SharingSettingsDtoCollectionVisibility) =>
      set({ collectionVisibility: value }),
    setWishlist: (value: SharingSettingsDtoCollectionVisibility) =>
      set({ wishlistVisibility: value }),
  };
}

/**
 * The claim field of 15e, checked while it is being typed.
 *
 * The check is debounced and the answer is a code the screen translates, so "taken",
 * "reserved" and "malformed" read as three different sentences instead of one shrug.
 */
export function useHandleClaimLogic(onClaimed?: () => void) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim().replace(/^@/, "")), 300);
    return () => clearTimeout(timer);
  }, [value]);

  const check = useQuery({
    queryKey: ["handle", "availability", debounced],
    queryFn: async () => await availability({ handle: debounced }),
    enabled: debounced.length > 0,
  });

  const claimIt = useMutation({
    mutationFn: async () => await claim({ handle: debounced }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(["sharing"], saved);
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
      onClaimed?.();
    },
  });

  return {
    value,
    setValue,
    /** Undefined until the debounce settles, so the field is not judged mid-word. */
    check:
      debounced.length > 0 && debounced === value.trim().replace(/^@/, "") ? check.data : undefined,
    checking: check.isFetching,
    claimIt,
    canClaim: check.data?.available === true && !claimIt.isPending,
  };
}
