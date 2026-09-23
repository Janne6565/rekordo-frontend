import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { requirePublicHandle } from "./publicHandle";

function refuses(handle: string): boolean {
  try {
    requirePublicHandle(handle);
    return false;
  } catch (error) {
    return isNotFound(error);
  }
}

describe("requirePublicHandle", () => {
  it("lets a handle with the @ through", () => {
    expect(refuses("@janne")).toBe(false);
  });

  it("refuses a path without the @", () => {
    expect(refuses("wishlis")).toBe(true);
  });

  it("refuses a bare @ and one followed only by whitespace", () => {
    expect(refuses("@")).toBe(true);
    expect(refuses("@ ")).toBe(true);
    expect(refuses("@\t ")).toBe(true);
  });
});
