import { FirstPullScreen } from "@/features/firstPull/FirstPullScreen";
import { useFirstPullActive } from "@/features/firstPull/useFirstPullLogic";
import { LibraryPage } from "@/features/library/LibraryPage";

/**
 * The library, or loading 1b while a browser that has never synced waits for its first pull.
 *
 * Only here and not on every route: signing in always lands on the library, and it is the
 * one page whose empty state would say something untrue in the meantime.
 */
export function LibraryGate() {
  return useFirstPullActive() ? <FirstPullScreen /> : <LibraryPage />;
}
