import { writeDiagnosticsLevel } from "@/local/diagnosticsConsent";
import type { TransportItem } from "@grafana/faro-web-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A stand-in SDK that records how it was configured. The real one would open a network
 * transport; what these tests care about is which configuration each level produces and
 * what the enforcement lets through.
 */
const calls = vi.hoisted(() => ({
  init: [] as Record<string, unknown>[],
  setSession: vi.fn(),
  setUser: vi.fn(),
  resetUser: vi.fn(),
  pause: vi.fn(),
  unpause: vi.fn(),
}));

const UserActionInstrumentation = vi.hoisted(
  () =>
    class UserActionInstrumentation {
      readonly kind = "user-actions";
    },
);

vi.mock("@grafana/faro-web-sdk", () => ({
  UserActionInstrumentation,
  // Mirrors the real function: user actions first, and no option to leave them out.
  getWebInstrumentations: () => [new UserActionInstrumentation(), "web"],
  initializeFaro: (config: Record<string, unknown>) => {
    calls.init.push(config);
    return {
      api: { setSession: calls.setSession, setUser: calls.setUser, resetUser: calls.resetUser },
      pause: calls.pause,
      unpause: calls.unpause,
    };
  },
}));
vi.mock("@grafana/faro-web-tracing", () => ({
  TracingInstrumentation: class {
    readonly kind = "tracing";
  },
}));

vi.stubEnv("VITE_FARO_COLLECTOR_URL", "https://collector.example/collect/key");

/** Faro keeps module state for the life of the page, so every test gets a fresh page. */
async function freshModule() {
  vi.resetModules();
  return import("@/diagnostics/faro");
}

async function started(level: "ANONYMOUS" | "FULL") {
  writeDiagnosticsLevel(level);
  const faro = await freshModule();
  faro.startDiagnostics(level);
  await vi.waitFor(() => expect(faro.diagnosticsMode()).toBe(level));
  return faro;
}

function item(overrides: Partial<TransportItem>): TransportItem {
  return {
    type: "log",
    payload: {},
    meta: {
      page: { url: "https://rekordo.jannekeipert.de/copies/2b7f1c7e-3d4a-4b5c-8d9e-0f1a2b3c4d5e" },
      user: { id: "user-1" },
      session: { id: "real-session" },
    },
    ...overrides,
  } as TransportItem;
}

describe("diagnostics configuration per level", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    calls.init.length = 0;
    vi.clearAllMocks();
  });

  it("anonymous turns session tracking off and sends the shared label as the session", async () => {
    await started("ANONYMOUS");
    expect(calls.init[0]?.sessionTracking).toEqual({ enabled: false });
    // The collector refuses requests without a session header, so one is set — but it is
    // the same for every anonymous browser, which is what makes it carry no identity.
    expect(calls.setSession).toHaveBeenCalledWith({ id: "anonymous" });
  });

  it("anonymous does not load tracing, because the backend trace is a Full-only promise", async () => {
    await started("ANONYMOUS");
    const instrumentations = calls.init[0]?.instrumentations as unknown[];
    expect(instrumentations.some((i) => (i as { kind?: string }).kind === "tracing")).toBe(false);
  });

  it("full keeps a per-tab session that is never persisted, and loads tracing", async () => {
    await started("FULL");
    expect(calls.init[0]?.sessionTracking).toEqual({ enabled: true, persistent: false });
    const instrumentations = calls.init[0]?.instrumentations as unknown[];
    expect(instrumentations.some((i) => (i as { kind?: string }).kind === "tracing")).toBe(true);
    expect(calls.setSession).not.toHaveBeenCalled();
  });

  it("anonymous filters out user actions, because the buttons you press are a Full disclosure", async () => {
    await started("ANONYMOUS");
    const instrumentations = calls.init[0]?.instrumentations as unknown[];
    expect(instrumentations.some((i) => i instanceof UserActionInstrumentation)).toBe(false);
  });

  it("full keeps user actions", async () => {
    await started("FULL");
    const instrumentations = calls.init[0]?.instrumentations as unknown[];
    expect(instrumentations.some((i) => i instanceof UserActionInstrumentation)).toBe(true);
  });

  it("never starts for a browser that answered NOTHING", async () => {
    writeDiagnosticsLevel("NOTHING");
    const faro = await freshModule();
    faro.startDiagnostics("NOTHING");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.init).toHaveLength(0);
  });

  it("refuses to hand an account id to an anonymous instance", async () => {
    const faro = await started("ANONYMOUS");
    faro.setDiagnosticsUser("user-1");
    expect(calls.setUser).not.toHaveBeenCalled();
  });
});

describe("changing level after Faro has started", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    calls.init.length = 0;
    vi.clearAllMocks();
  });

  it("pauses at once on a downgrade from FULL to ANONYMOUS", async () => {
    const faro = await started("FULL");
    writeDiagnosticsLevel("ANONYMOUS");
    faro.startDiagnostics("ANONYMOUS");
    expect(calls.pause).toHaveBeenCalled();
  });

  it("pauses at once when withdrawn to NOTHING", async () => {
    const faro = await started("ANONYMOUS");
    writeDiagnosticsLevel("NOTHING");
    faro.startDiagnostics("NOTHING");
    expect(calls.pause).toHaveBeenCalled();
  });

  it("does not start a second instance on an upgrade, it keeps under-collecting", async () => {
    const faro = await started("ANONYMOUS");
    writeDiagnosticsLevel("FULL");
    faro.startDiagnostics("FULL");
    expect(calls.init).toHaveLength(1);
    expect(faro.diagnosticsMode()).toBe("ANONYMOUS");
  });
});

describe("applyLevel", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    calls.init.length = 0;
  });

  it("strips the account and the record id from an anonymous item", async () => {
    const faro = await started("ANONYMOUS");
    const out = faro.applyLevel(item({}));
    expect(out?.meta.user).toBeUndefined();
    expect(out?.meta.page?.url).toBe("https://rekordo.jannekeipert.de/copies/:id");
  });

  it("drops a trace that reaches an anonymous instance by any route", async () => {
    const faro = await started("ANONYMOUS");
    expect(faro.applyLevel(item({ type: "trace" } as Partial<TransportItem>))).toBeNull();
  });

  it("drops a user-action event that reaches an anonymous instance by any route", async () => {
    const faro = await started("ANONYMOUS");
    const action = item({
      type: "event",
      payload: { name: "faro.user.action" },
    } as Partial<TransportItem>);
    expect(faro.applyLevel(action)).toBeNull();
  });

  it("lets a user-action event through at FULL", async () => {
    const faro = await started("FULL");
    const action = item({
      type: "event",
      payload: { name: "faro.user.action" },
    } as Partial<TransportItem>);
    expect(faro.applyLevel(action)).toBe(action);
  });

  it("drops everything queued by a FULL instance once the reader has downgraded", async () => {
    const faro = await started("FULL");
    writeDiagnosticsLevel("ANONYMOUS");
    expect(faro.applyLevel(item({}))).toBeNull();
  });

  it("passes a FULL item through untouched while FULL is still allowed", async () => {
    const faro = await started("FULL");
    const input = item({});
    expect(faro.applyLevel(input)).toBe(input);
  });
});
