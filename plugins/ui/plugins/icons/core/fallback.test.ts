import { describe, expect, it } from "bun:test";
import { coveredStyles, resolveSymbolStyle } from "./fallback";
import type { StyleKey } from "./style";

// Coverage as the installed sets draw these names (material-symbols 1.2.93,
// material-symbols-light 1.2.94).
const COVERAGE: Record<string, StyleKey[]> = {
  "auto-awesome": [
    "default-filled-400",
    "default-outline-400",
    "rounded-filled-400",
    "rounded-outline-400",
    "sharp-filled-400",
    "sharp-outline-400",
  ],
  "auto-mode": ["default-filled-400", "rounded-filled-400", "sharp-filled-400"],
  "auto-fix-high": ["default-filled-400"],
  insights: ["default-filled-400", "sharp-filled-400"],
  "phone-iphone": [
    "default-filled-400",
    "default-outline-400",
    "sharp-filled-400",
    "sharp-outline-400",
    "default-filled-300",
    "default-outline-300",
    "sharp-filled-300",
    "sharp-outline-300",
  ],
};

const resolve = (name: string, requested: StyleKey) =>
  resolveSymbolStyle(COVERAGE[name]!, requested);

describe("resolveSymbolStyle", () => {
  it("draws the requested style when the name has it", () => {
    expect(resolve("phone-iphone", "sharp-outline-300")).toBe(
      "sharp-outline-300",
    );
  });

  it("keeps the fill before the weight: light outline falls back to regular outline", () => {
    expect(resolve("auto-awesome", "default-outline-300")).toBe(
      "default-outline-400",
    );
    expect(resolve("auto-awesome", "rounded-filled-300")).toBe(
      "rounded-filled-400",
    );
  });

  it("keeps the weight before the shape: rounded light goes to default light", () => {
    expect(resolve("phone-iphone", "rounded-outline-300")).toBe(
      "default-outline-300",
    );
  });

  it("prefers the default shape when the requested one is missing", () => {
    expect(resolve("insights", "rounded-filled-400")).toBe(
      "default-filled-400",
    );
  });

  it("draws a filled-only icon filled at rest", () => {
    expect(resolve("insights", "default-outline-400")).toBe(
      "default-filled-400",
    );
    expect(resolve("insights", "sharp-outline-300")).toBe("sharp-filled-400");
    expect(resolve("auto-mode", "rounded-outline-400")).toBe(
      "rounded-filled-400",
    );
  });

  it("draws a one-style icon in every style", () => {
    expect(resolve("auto-fix-high", "sharp-outline-300")).toBe(
      "default-filled-400",
    );
  });

  it("throws when no style draws the name", () => {
    expect(() => resolveSymbolStyle([], "default-outline-400")).toThrow();
  });
});

describe("coveredStyles", () => {
  it("lists the styles whose Iconify name the lookup holds", () => {
    const regular = new Set(["insights", "insights-sharp"]);
    expect(
      coveredStyles("insights", (w, n) => w === "regular" && regular.has(n)),
    ).toEqual(COVERAGE.insights!);
  });
});
