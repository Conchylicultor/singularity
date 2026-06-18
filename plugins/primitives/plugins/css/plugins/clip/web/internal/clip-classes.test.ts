import { describe, expect, test } from "bun:test";
import { clipClasses } from "./clip";

describe("clipClasses", () => {
  test("both clips on both axes", () => {
    expect(clipClasses({ axis: "both", fill: false })).toBe("overflow-hidden");
  });

  test("x and y clip a single axis", () => {
    expect(clipClasses({ axis: "x", fill: false })).toBe("overflow-x-hidden");
    expect(clipClasses({ axis: "y", fill: false })).toBe("overflow-y-hidden");
  });

  test("fill adds the flex-child fill pair", () => {
    expect(clipClasses({ axis: "both", fill: true })).toBe(
      "overflow-hidden min-h-0 flex-1",
    );
  });
});
