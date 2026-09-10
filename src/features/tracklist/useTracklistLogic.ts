import { type Tracklist, fetchTracklist } from "@/api/tracklist";
import { isManualReleaseId } from "@janne6565/rekordo-shared";
import { useQuery } from "@tanstack/react-query";

/**
 * The tracklist for one release, asked for when its sheet opens.
 *
 * Cached forever within the session and never refetched: the server reads MusicBrainz once
 * per release and answers from its own table afterwards, so both answers here — the titles,
 * and "there will never be titles" — are settled facts. A retry would cost a paced upstream
 * call to be told the same thing.
 *
 * A hand-entered copy is answered without a request at all. Its release is derived from the
 * copy itself and points at no catalogue, which the client already knows from the id.
 */

const HAND_ENTERED: Tracklist = {
  trackCount: null,
  discCount: null,
  media: [],
  absence: "HAND_ENTERED",
};

export interface TracklistState {
  readonly tracklist: Tracklist | undefined;
  /** True while the catalogue is being read — the state the section reserves height for. */
  readonly loading: boolean;
  /** The one failure worth a button: the request itself did not get through. */
  readonly unreachable: boolean;
  readonly retry: () => void;
}

export function useTracklistLogic(releaseId: string | null | undefined): TracklistState {
  // `!= null` throughout, not `!== undefined`: the generated DTOs type every field
  // optional, but the wire carries an explicit null for a copy or a wish that names no
  // pressing. Checking only for undefined let that null reach `isManualReleaseId`, which
  // called `startsWith` on it and took the whole sheet down.
  const manual = releaseId != null && isManualReleaseId(releaseId);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["tracklist", releaseId],
    queryFn: () => fetchTracklist(releaseId as string),
    enabled: releaseId != null && !manual,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  if (manual) {
    return { tracklist: HAND_ENTERED, loading: false, unreachable: false, retry: () => {} };
  }
  return {
    tracklist: data,
    loading: releaseId != null && isPending && !isError,
    unreachable: isError,
    retry: () => void refetch(),
  };
}
