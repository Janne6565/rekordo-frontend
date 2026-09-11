import { setDiagnosticsUser, startDiagnostics } from "@/diagnostics/faro";
import {
  type DiagnosticsLevel,
  readDiagnosticsDecision,
  writeDiagnosticsLevel,
} from "@/local/diagnosticsConsent";
import { useAppSelector } from "@/store/hooks";
import { useCallback, useState } from "react";

interface DiagnosticsSettingsState {
  readonly level: DiagnosticsLevel | null;
  readonly decidedAt: number | null;
  readonly detailOpen: boolean;
  readonly choose: (level: DiagnosticsLevel) => void;
  readonly toggleDetail: () => void;
}

/**
 * The same choice as the slip, for as long as the account lasts.
 *
 * Changing the level takes effect on the next event rather than the next reload, in both
 * directions — see the note in `diagnostics/faro.ts`. That is what lets the row copy
 * promise "tap another row and it changes at once" without lying: turning collection down
 * has to be immediate, and a setting that only half-applies until a refresh would be a
 * privacy control that quietly does not work yet.
 *
 * There is no Undo window here, unlike the slip. Undo exists there because the answer was
 * given in one gesture on a screen nobody asked for; in Settings the reader came looking
 * for the control, and the row they just left is the undo.
 */
export function useDiagnosticsSettingsLogic(): DiagnosticsSettingsState {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const [decision, setDecision] = useState(() => readDiagnosticsDecision());
  const [detailOpen, setDetailOpen] = useState(false);

  const choose = useCallback(
    (level: DiagnosticsLevel) => {
      const at = Date.now();
      // Written before anything else: `beforeSend` reads this on every item, so the moment
      // it lands the new level is already being enforced on data in flight.
      writeDiagnosticsLevel(level, at);
      setDecision({ level, at });
      startDiagnostics(level);
      setDiagnosticsUser(level === "FULL" ? userId : null);
    },
    [userId],
  );

  return {
    level: decision?.level ?? null,
    decidedAt: decision?.at ?? null,
    detailOpen,
    choose,
    toggleDetail: useCallback(() => setDetailOpen((open) => !open), []),
  };
}
