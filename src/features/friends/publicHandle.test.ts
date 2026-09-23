import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { isBareHandlePath, requirePublicHandle } from "./publicHandle";

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

describe("isBareHandlePath", () => {
  it("recognises the public link with no name in it", () => {
    expect(isBareHandlePath("/@")).toBe(true);
    expect(isBareHandlePath("/@/wishlist")).toBe(true);
    expect(isBareHandlePath("/%40")).toBe(true);
    expect(isBareHandlePath("/@%20/wishlist")).toBe(true);
  });

  it("leaves a named handle and every other path alone", () => {
    expect(isBareHandlePath("/@janne")).toBe(false);
    expect(isBareHandlePath("/shelf/2019")).toBe(false);
    expect(isBareHandlePath("/")).toBe(false);
    expect(isBareHandlePath("/%E0%A4%A")).toBe(false);
  });
});
