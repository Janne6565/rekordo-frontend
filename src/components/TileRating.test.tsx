// Real bundle, because the only text this draws is the spoken label.
import "@/i18n/config";
import { TileRating } from "@/components/TileRating";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("TileRating", () => {
  it("draws nothing at all for a copy with no rating on it", () => {
    // Null is both "unrated" and "the owner keeps their ratings to themselves". Neither
    // may leave a row of hollow stars behind, and neither may be told apart from the other.
    const { container: none } = render(<TileRating rating={null} />);
    expect(none.firstChild).toBeNull();

    const { container: missing } = render(<TileRating rating={undefined} />);
    expect(missing.firstChild).toBeNull();

    // A zero off an older row is a rating nobody gave, not a rating of nothing.
    const { container: zero } = render(<TileRating rating={0} />);
    expect(zero.firstChild).toBeNull();
  });

  it("fills three and hollows two", () => {
    render(<TileRating rating={3} />);

    const bar = screen.getByLabelText("Rate 3 out of 5");
    expect(bar.textContent).toBe("★★★☆☆");
  });

  it("never draws more than five, whatever the server sends", () => {
    render(<TileRating rating={9} />);

    expect(screen.getByLabelText("Rate 5 out of 5").textContent).toBe("★".repeat(5));
  });
});
