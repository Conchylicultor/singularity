import { describe, expect, test } from "bun:test";
import { stickyClasses } from "./sticky";

describe("stickyClasses", () => {
  test("default top edge, flush, raised layer", () => {
    expect(stickyClasses({ edge: "top", offset: "none", layer: "raised" })).toEqual({
      className: "sticky z-raised",
      style: { top: "0" },
    });
  });

  test("bottom edge maps to the bottom inset", () => {
    expect(stickyClasses({ edge: "bottom", offset: "none", layer: "raised" })).toEqual({
      className: "sticky z-raised",
      style: { bottom: "0" },
    });
  });

  test("a non-none offset reads the density --space var", () => {
    expect(stickyClasses({ edge: "top", offset: "sm", layer: "nav" })).toEqual({
      className: "sticky z-nav",
      style: { top: "var(--space-sm)" },
    });
  });

  test("left/right edges map to their insets", () => {
    expect(stickyClasses({ edge: "left", offset: "xs", layer: "float" })).toEqual({
      className: "sticky z-float",
      style: { left: "var(--space-xs)" },
    });
    expect(stickyClasses({ edge: "right", offset: "none", layer: "base" })).toEqual({
      className: "sticky z-base",
      style: { right: "0" },
    });
  });
});
