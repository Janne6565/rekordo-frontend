import { resources } from "@/i18n/resources";
import { describe, expect, it } from "vitest";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafPaths(child, prefix === "" ? key : `${prefix}.${key}`),
  );
}

describe("translation resources", () => {
  const languages = Object.keys(resources) as (keyof typeof resources)[];
  const expected = leafPaths(resources.en.common).sort();

  it.each(languages)("%s defines exactly the same keys as en", (language) => {
    expect(leafPaths(resources[language].common).sort()).toEqual(expected);
  });

  // A placeholder only one language has is one the call site was never written to fill, so
  // it reaches the page as literal `{{title}}`.
  it.each(languages)("%s uses the same placeholders as en", (language) => {
    const placeholders = (common: unknown) =>
      leafPaths(common).map((path) => {
        const value = path
          .split(".")
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], common) as string;
        const names = [...value.matchAll(/\{\{\s*(\w+)/g)].map((match) => match[1]).sort();
        return `${path}: ${names.join(",")}`;
      });
    expect(placeholders(resources[language].common).sort()).toEqual(
      placeholders(resources.en.common).sort(),
    );
  });

  it("has no empty translations", () => {
    for (const language of languages) {
      const values = leafPaths(resources[language].common).map((path) =>
        path
          .split(".")
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown>)[key],
            resources[language].common,
          ),
      );
      expect(values.every((value) => typeof value === "string" && value.trim().length > 0)).toBe(
        true,
      );
    }
  });
});
