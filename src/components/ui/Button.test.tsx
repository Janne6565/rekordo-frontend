import { Button } from "@/components/ui/Button";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Button user actions", () => {
  it("marks the button for Faro when given an action", () => {
    render(<Button action="copy.add">Add</Button>);
    expect(screen.getByRole("button").getAttribute("data-faro-user-action-name")).toBe("copy.add");
  });

  it("carries no attribute otherwise, so an unnamed button is never timed", () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole("button").hasAttribute("data-faro-user-action-name")).toBe(false);
  });
});
