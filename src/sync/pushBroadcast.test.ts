import { describe, expect, it, vi } from "vitest";
import { announcePush, onPushElsewhere } from "./pushBroadcast";

describe("pushBroadcast", () => {
  it("tells another tab that this one pushed, and not this tab itself", async () => {
    // Another tab is another channel on the same name.
    const otherTab = new BroadcastChannel("rekordo.sync");
    const heardElsewhere = vi.fn();
    otherTab.onmessage = heardElsewhere;
    const heardHere = vi.fn();
    const unsubscribe = onPushElsewhere(heardHere);

    announcePush();
    await vi.waitFor(() => expect(heardElsewhere).toHaveBeenCalledTimes(1));
    expect(heardHere).not.toHaveBeenCalled();

    otherTab.postMessage("pushed");
    await vi.waitFor(() => expect(heardHere).toHaveBeenCalledTimes(1));

    unsubscribe();
    otherTab.close();
  });
});
