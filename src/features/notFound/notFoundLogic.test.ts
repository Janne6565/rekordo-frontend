import { describe, expect, it } from "vitest";
import { displayPath, frameFor } from "./notFoundLogic";

describe("frameFor", () => {
  it("keeps the shell for somebody signed in", () => {
    expect(frameFor("signedIn")).toBe("shell");
  });

  it("stands alone for a visitor", () => {
    expect(frameFor("anonymous")).toBe("standalone");
  });

  it("draws neither while the session is still unknown", () => {
    expect(frameFor("unknown")).toBe("pending");
  });
});

describe("displayPath", () => {
  it("reads escapes back into what was typed", () => {
    expect(displayPath("/regal%202019")).toBe("/regal 2019");
    expect(displayPath("/%C3%BCber")).toBe("/über");
  });

  it("prints a malformed escape as it came", () => {
    expect(displayPath("/%E0%A4%A")).toBe("/%E0%A4%A");
  });
});
