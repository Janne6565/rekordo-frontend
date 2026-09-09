// The lines are translated strings, so the real bundle is what they are rendered with.
import "@/i18n/config";
import type { ActivityEntryDto } from "@/api/generated/rekordoAPI.schemas";
import { ActivityFeed } from "@/features/friends/ActivityFeed";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { readonly children: ReactNode }) => <a {...rest}>{children}</a>,
}));

function acceptedBy(byViewer: boolean): ActivityEntryDto {
  return {
    id: "a-1",
    type: "FRIENDSHIP_ACCEPTED",
    // Whichever way round it went, the person on the line is the other one.
    actor: { id: "p-1", handle: "martaknopf", displayName: "Marta Knopf" },
    occurredAt: new Date().toISOString(),
    copyCount: 1,
    byViewer,
  };
}

describe("ActivityFeed", () => {
  it("tells the person who asked who accepted them", () => {
    render(<ActivityFeed entries={[acceptedBy(false)]} loading={false} />);

    expect(screen.getByText(/accepted your request/)).toBeTruthy();
    expect(screen.getByText("Marta Knopf")).toBeTruthy();
  });

  it("tells the accepter what they did, without handing them their own name", () => {
    render(<ActivityFeed entries={[acceptedBy(true)]} loading={false} />);

    expect(screen.getByText(/^You accepted/)).toBeTruthy();
    expect(screen.getByText("Marta Knopf")).toBeTruthy();
  });
});
