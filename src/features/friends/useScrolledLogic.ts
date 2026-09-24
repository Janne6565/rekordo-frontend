import { type UIEvent, useCallback, useState } from "react";

/**
 * Whether a scroll area has left its top, for a header pinned inside it that should only
 * cast its shadow once something is actually scrolling under it (2a).
 */
export function useScrolledLogic() {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    // Same boolean as before means React bails out, so this is not a render per frame.
    setScrolled(event.currentTarget.scrollTop > 0);
  }, []);
  return { scrolled, onScroll };
}
