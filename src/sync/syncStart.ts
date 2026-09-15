import { readSyncEnabled } from "@/local/settings";
import type { LocalStore } from "@janne6565/rekordo-shared";

export interface SyncStart {
  /** A local collection that has never synced: ask what to do with it first (29). */
  readonly firstSyncPending: boolean;
  /**
   * Nothing on this device and nothing ever pulled: the shelf would claim to be empty
   * until the first pull lands, so the library waits behind loading 1b instead.
   */
  readonly awaitingFirstPull: boolean;
}

/**
 * What a freshly signed-in browser has to do before its shelf means anything.
 *
 * Shared by the password sign-in and the session restored from the refresh cookie (which
 * is also how a provider sign-in arrives), so both reach the same answer.
 */
export async function readSyncStart(store: LocalStore): Promise<SyncStart> {
  const hasLocalCollection = (await store.listCopies()).length > 0;
  const hasSyncedBefore = (await store.readSyncCursor()) > 0;
  if (hasSyncedBefore) return { firstSyncPending: false, awaitingFirstPull: false };
  if (hasLocalCollection) return { firstSyncPending: true, awaitingFirstPull: false };
  // Wishes alone are not a collection to ask about, but they are not an empty shelf either.
  const hasLocalWishes = (await store.listWishlist()).length > 0;
  // With sync switched off nothing will ever arrive, and the screen would wait forever.
  const awaitingFirstPull = !hasLocalWishes && (await readSyncEnabled(store));
  return { firstSyncPending: false, awaitingFirstPull };
}
