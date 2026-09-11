import { setDiagnosticsUser, startDiagnostics } from "@/diagnostics/faro";
import {
  CONSENT_UNDO_HOLD,
  type DiagnosticsLevel,
  clearDiagnosticsLevel,
  readDiagnosticsDecision,
  writeDiagnosticsLevel,
} from "@/local/diagnosticsConsent";
import { useAppSelector } from "@/store/hooks";
import { useCallback, useEffect, useRef, useState } from "react";

/** Which face the slip is showing. */
export type SlipStage = "HIDDEN" | "CHOOSING" | "DETAIL" | "ACKNOWLEDGED";

interface ConsentSlipState {
  readonly stage: SlipStage;
  /** The row that is ticked but not yet saved. Nothing is preselected. */
  readonly picked: DiagnosticsLevel | null;
  /** What was actually saved, for the acknowledgement line. */
  readonly saved: DiagnosticsLevel | null;
  readonly canSave: boolean;
  readonly pick: (level: DiagnosticsLevel) => void;
  readonly save: () => void;
  readonly undo: () => void;
  readonly dismiss: () => void;
  readonly openDetail: () => void;
  readonly closeDetail: () => void;
}

/**
 * The one-question slip, and the eight seconds after it.
 *
 * The account is read here rather than passed in, because the slip is mounted above the
 * router where nothing knows about sessions. It is only ever handed to diagnostics at
 * FULL; at the other two levels the account is not attached, and the transport strips it
 * a second time on the way out.
 */
export function useConsentSlipLogic(): ConsentSlipState {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  // Read once at mount rather than on every render: a decision made in Settings should not
  // make the slip reappear behind the reader, and the slip is only ever about the first
  // unanswered visit.
  const [stage, setStage] = useState<SlipStage>(() =>
    readDiagnosticsDecision() === null ? "CHOOSING" : "HIDDEN",
  );
  const [picked, setPicked] = useState<DiagnosticsLevel | null>(null);
  const [saved, setSaved] = useState<DiagnosticsLevel | null>(null);
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const save = useCallback(() => {
    if (picked === null) return;
    writeDiagnosticsLevel(picked);
    setSaved(picked);
    setStage("ACKNOWLEDGED");
    // Deliberately NOT started here. The choice can still be taken back for eight seconds,
    // and anything sent inside that window would outlive an Undo that promised otherwise.
    // Starting is what the timer below does once the window has closed for good.
    clearTimer();
    timer.current = window.setTimeout(() => {
      startDiagnostics(picked);
      if (picked === "FULL") setDiagnosticsUser(userId);
      setStage("HIDDEN");
    }, CONSENT_UNDO_HOLD);
  }, [picked, userId, clearTimer]);

  const undo = useCallback(() => {
    clearTimer();
    clearDiagnosticsLevel();
    setSaved(null);
    setPicked(null);
    setStage("CHOOSING");
  }, [clearTimer]);

  /** Closing the acknowledgement early accepts the choice; it does not cancel it. */
  const dismiss = useCallback(() => {
    clearTimer();
    if (saved !== null) {
      startDiagnostics(saved);
      if (saved === "FULL") setDiagnosticsUser(userId);
    }
    setStage("HIDDEN");
  }, [saved, userId, clearTimer]);

  return {
    stage,
    picked,
    saved,
    canSave: picked !== null,
    pick: setPicked,
    save,
    undo,
    dismiss,
    openDetail: useCallback(() => setStage("DETAIL"), []),
    closeDetail: useCallback(() => setStage("CHOOSING"), []),
  };
}
