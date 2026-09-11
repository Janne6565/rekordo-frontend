import { useConsentSlipLogic } from "@/features/diagnostics/useConsentSlipLogic";
import { CONSENT_UNDO_HOLD, readDiagnosticsLevel } from "@/local/diagnosticsConsent";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startDiagnostics = vi.fn();
const setDiagnosticsUser = vi.fn();

vi.mock("@/diagnostics/faro", () => ({
  startDiagnostics: (...args: unknown[]) => startDiagnostics(...args),
  setDiagnosticsUser: (...args: unknown[]) => setDiagnosticsUser(...args),
}));

let signedInUserId: string | null = null;
vi.mock("@/store/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: signedInUserId === null ? null : { id: signedInUserId } } }),
}));

describe("useConsentSlipLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    globalThis.localStorage.clear();
    signedInUserId = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks an unanswered browser and preselects nothing", () => {
    const { result } = renderHook(() => useConsentSlipLogic());
    expect(result.current.stage).toBe("CHOOSING");
    expect(result.current.picked).toBeNull();
    // Save is inert until a row is chosen, so no answer is the default answer.
    expect(result.current.canSave).toBe(false);
  });

  it("does not ask again once an answer exists, including NOTHING", () => {
    globalThis.localStorage.setItem(
      "music-collector-diagnostics-consent",
      JSON.stringify({ level: "NOTHING", at: 1 }),
    );
    const { result } = renderHook(() => useConsentSlipLogic());
    expect(result.current.stage).toBe("HIDDEN");
  });

  it("holds collection back until the Undo window has closed", () => {
    const { result } = renderHook(() => useConsentSlipLogic());
    act(() => result.current.pick("ANONYMOUS"));
    act(() => result.current.save());

    // The answer is recorded immediately...
    expect(readDiagnosticsLevel()).toBe("ANONYMOUS");
    expect(result.current.stage).toBe("ACKNOWLEDGED");
    // ...but nothing is collected yet, because Undo is still on offer. Starting here would
    // send data that an Undo one second later could not take back.
    expect(startDiagnostics).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(CONSENT_UNDO_HOLD));
    expect(startDiagnostics).toHaveBeenCalledWith("ANONYMOUS");
    expect(result.current.stage).toBe("HIDDEN");
  });

  it("undo returns the browser to genuinely unasked and never starts collection", () => {
    const { result } = renderHook(() => useConsentSlipLogic());
    act(() => result.current.pick("FULL"));
    act(() => result.current.save());
    act(() => result.current.undo());

    expect(readDiagnosticsLevel()).toBeNull();
    expect(result.current.stage).toBe("CHOOSING");
    expect(result.current.picked).toBeNull();

    act(() => vi.advanceTimersByTime(CONSENT_UNDO_HOLD * 2));
    expect(startDiagnostics).not.toHaveBeenCalled();
  });

  it("attaches the account only at FULL", () => {
    signedInUserId = "user-1";
    const { result } = renderHook(() => useConsentSlipLogic());
    act(() => result.current.pick("ANONYMOUS"));
    act(() => result.current.save());
    act(() => vi.advanceTimersByTime(CONSENT_UNDO_HOLD));
    expect(setDiagnosticsUser).not.toHaveBeenCalled();
  });

  it("attaches the account at FULL when there is one", () => {
    signedInUserId = "user-1";
    const { result } = renderHook(() => useConsentSlipLogic());
    act(() => result.current.pick("FULL"));
    act(() => result.current.save());
    act(() => vi.advanceTimersByTime(CONSENT_UNDO_HOLD));
    expect(setDiagnosticsUser).toHaveBeenCalledWith("user-1");
  });

  it("dismissing early accepts the choice rather than cancelling it", () => {
    const { result } = renderHook(() => useConsentSlipLogic());
    act(() => result.current.pick("ANONYMOUS"));
    act(() => result.current.save());
    act(() => result.current.dismiss());

    expect(readDiagnosticsLevel()).toBe("ANONYMOUS");
    expect(startDiagnostics).toHaveBeenCalledWith("ANONYMOUS");
    expect(result.current.stage).toBe("HIDDEN");
  });
});
