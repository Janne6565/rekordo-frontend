import {
  accept,
  activity,
  decline,
  overview,
  remove,
  request,
} from "@/api/generated/friends/friends";
import { claim } from "@/api/generated/handles/handles";
import { searchProfiles } from "@/api/generated/profiles/profiles";
import { read as readSharing } from "@/api/generated/sharing/sharing";
import { useAppSelector } from "@/store/hooks";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

/** Shorter and the server returns nothing, so asking would only make the field flicker. */
const MIN_QUERY = 3;

/**
 * The Friends page (15g) and the People panel behind it.
 *
 * Everything social needs an account, so every query here is gated on being signed in
 * rather than firing and collecting 401s. Search is the exception, on the server and now
 * here too: looking somebody up is what a handle is handed out for, and a visitor who has
 * to make an account before they can even find the shelf they were pointed at has been
 * asked to pay before being shown anything.
 */
export function useFriendsLogic() {
  const signedIn = useAppSelector((state) => state.auth.status === "signedIn");
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");

  const sharing = useQuery({
    queryKey: ["sharing"],
    queryFn: async () => await readSharing(),
    enabled: signedIn,
  });

  const people = useQuery({
    queryKey: ["friends", "overview"],
    queryFn: async () => await overview(),
    enabled: signedIn,
  });

  const feed = useQuery({
    queryKey: ["friends", "activity"],
    queryFn: async () => await activity(),
    enabled: signedIn,
  });

  const trimmed = query.trim().replace(/^@/, "");
  const results = useQuery({
    queryKey: ["friends", "search", trimmed],
    queryFn: async () => await searchProfiles({ q: trimmed }),
    // Deliberately not gated on `signedIn`: the endpoint is open, and the answer it gives
    // a stranger is the same one minus the relationship verdicts.
    enabled: trimmed.length >= MIN_QUERY,
    // The list belongs to the previous keystroke until the next answer lands. Without it
    // the results empty out between every letter, which reads as "no matches" over and over.
    placeholderData: keepPreviousData,
  });

  /**
   * Anything that changes the graph invalidates both panels.
   *
   * Accepting a request moves a person from one list to the other *and* puts a line in the
   * feed, so refreshing only the list would leave the feed a step behind on the same screen.
   */
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["friends"] });
  }, [queryClient]);

  const ask = useMutation({
    mutationFn: async (handle: string) => request({ handle }),
    onSuccess: refresh,
  });

  const acceptRequest = useMutation({
    mutationFn: async (id: string) => accept(id),
    onSuccess: refresh,
  });

  const declineRequest = useMutation({
    mutationFn: async (id: string) => decline(id),
    onSuccess: refresh,
  });

  const unfriend = useMutation({
    mutationFn: async (userId: string) => remove(userId),
    onSuccess: refresh,
  });

  const claimHandle = useMutation({
    mutationFn: async (handle: string) => await claim({ handle }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sharing"] });
      await refresh();
    },
  });

  return {
    signedIn,
    /**
     * Whether the handle screen (15e) has to come first. Undefined while the settings are
     * still loading, so the page can wait rather than flash the claim form at somebody who
     * already has one.
     */
    needsHandle: sharing.data === undefined ? undefined : !sharing.data.handle,
    sharing: sharing.data,
    handle: sharing.data?.handle,
    friends: people.data?.friends ?? [],
    incoming: people.data?.incoming ?? [],
    outgoing: people.data?.outgoing ?? [],
    entries: feed.data?.entries ?? [],
    loading: people.isLoading || feed.isLoading,
    query,
    setQuery,
    /** Empty until the query is long enough — never a partial directory. */
    results: trimmed.length >= MIN_QUERY ? (results.data ?? []) : [],
    searching: results.isFetching,
    queryTooShort: trimmed.length > 0 && trimmed.length < MIN_QUERY,
    /** Whether a real query has been asked — the difference between "nothing yet" and "nobody". */
    searched: trimmed.length >= MIN_QUERY,
    /** Anything typed at all: on the phone's Find tab (2a) the results are then the whole tab. */
    queryActive: trimmed.length > 0,
    /** A real query whose answer came back empty, rather than one still on its way. */
    nothingFound:
      trimmed.length >= MIN_QUERY && !results.isFetching && (results.data ?? []).length === 0,
    ask,
    acceptRequest,
    declineRequest,
    unfriend,
    claimHandle,
  };
}
