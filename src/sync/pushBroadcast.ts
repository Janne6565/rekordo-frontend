/**
 * Tells the app's other tabs that this one just pushed.
 *
 * Tabs share the local store but not their query caches, and the public profile is not
 * in the local store at all: it is the server's answer. So a tab that has /@handle open
 * keeps showing a copy this tab just hid until something makes it ask again -- which,
 * before this, was a window focus that could land before the push did.
 */
const CHANNEL = "rekordo.sync";
const PUSHED = "pushed";

/**
 * One channel per tab, for sending and listening both: a channel never hears its own
 * messages, which is what keeps a tab from re-invalidating what it just refreshed.
 */
let channel: BroadcastChannel | null | undefined;

function tabChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    // Absent in some test environments and very old browsers; the tab itself still works.
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  }
  return channel;
}

/** Announces a push that landed, to every other tab. */
export function announcePush(): void {
  tabChannel()?.postMessage(PUSHED);
}

/** Calls `listener` whenever another tab pushes. Returns the unsubscribe. */
export function onPushElsewhere(listener: () => void): () => void {
  const current = tabChannel();
  if (current === null) return () => undefined;
  const onMessage = (event: MessageEvent) => {
    if (event.data === PUSHED) listener();
  };
  current.addEventListener("message", onMessage);
  return () => current.removeEventListener("message", onMessage);
}
