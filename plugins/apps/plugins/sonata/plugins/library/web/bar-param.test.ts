import { describe, expect, it } from "bun:test";
import { formatBarParam, parseBarParam } from "./bar-param";

describe("parseBarParam", () => {
  it("reads a plain integer", () => {
    expect(parseBarParam("3")).toBe(3);
    expect(parseBarParam("0")).toBe(0);
    expect(parseBarParam("120")).toBe(120);
  });

  it("treats a missing or malformed segment as no bar", () => {
    for (const raw of [undefined, "", "3.5", "-1", "x", "3a", " 3", "1e3"]) {
      expect(parseBarParam(raw)).toBeUndefined();
    }
  });

  it("round-trips with formatBarParam", () => {
    expect(parseBarParam(formatBarParam(7))).toBe(7);
  });

  it("refuses to format a non-bar", () => {
    expect(() => formatBarParam(1.5)).toThrow();
    expect(() => formatBarParam(-2)).toThrow();
  });
});
