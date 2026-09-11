import {
  clearDiagnosticsLevel,
  readDiagnosticsDecision,
  readDiagnosticsLevel,
  writeDiagnosticsLevel,
} from "@/local/diagnosticsConsent";
import { beforeEach, describe, expect, it } from "vitest";

const KEY = "music-collector-diagnostics-consent";

describe("diagnosticsConsent", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it("reports an unasked browser as null rather than a level", () => {
    expect(readDiagnosticsDecision()).toBeNull();
    expect(readDiagnosticsLevel()).toBeNull();
  });

  it("round-trips a level with the date it was chosen", () => {
    writeDiagnosticsLevel("ANONYMOUS", 1_757_500_000_000);
    expect(readDiagnosticsDecision()).toEqual({ level: "ANONYMOUS", at: 1_757_500_000_000 });
  });

  it("treats NOTHING as an answer, not as the absence of one", () => {
    writeDiagnosticsLevel("NOTHING");
    // The distinction the slip depends on: answering NOTHING must stop it asking again,
    // so this may not read back as null.
    expect(readDiagnosticsLevel()).toBe("NOTHING");
  });

  it("returns to unasked after a clear, so Undo really re-opens the question", () => {
    writeDiagnosticsLevel("FULL");
    clearDiagnosticsLevel();
    expect(readDiagnosticsDecision()).toBeNull();
  });

  /*
   * The three below are the same rule from three directions: a value that is not a level
   * this build understands means "not answered". Coercing any of them to a collecting
   * level would opt somebody in who never said yes.
   */
  it("does not opt anyone in from a hand-edited value", () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify({ level: "EVERYTHING", at: 1 }));
    expect(readDiagnosticsLevel()).toBeNull();
  });

  it("does not opt anyone in from a half-written value", () => {
    globalThis.localStorage.setItem(KEY, '{"level":"FU');
    expect(readDiagnosticsLevel()).toBeNull();
  });

  it("does not opt anyone in from a bare string written by an older build", () => {
    globalThis.localStorage.setItem(KEY, "FULL");
    expect(readDiagnosticsLevel()).toBeNull();
  });
});
