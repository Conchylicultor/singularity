import { describe, expect, it } from "bun:test";
import {
  VIEWER_KEYS,
  matchViewerKey,
  viewerKey,
  type ViewerAction,
  type ViewerMode,
} from "./keys";

const press = (
  key: string,
  mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {},
  mode: ViewerMode = "single",
) =>
  matchViewerKey(
    {
      key,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      ...mods,
    },
    mode,
  );

describe("matchViewerKey", () => {
  it("maps each documented key to its action", () => {
    expect(press("Escape")).toBe("close");
    expect(press("+")).toBe("zoom-in");
    expect(press("=")).toBe("zoom-in");
    expect(press("-")).toBe("zoom-out");
    expect(press("0")).toBe("fit");
    expect(press("1")).toBe("actual-size");
    expect(press("ArrowLeft")).toBe("previous");
    expect(press("ArrowRight")).toBe("next");
    expect(press("?")).toBe("shortcuts");
    expect(press("s")).toBe("toggle-strip");
    expect(press("G")).toBe("toggle-grid");
    expect(press("f")).toBe("slideshow");
  });

  it("acts only in the modes a key's row lists", () => {
    // ↑ / ↓ / Enter move and open in the grid; the single view leaves them alone.
    expect(press("ArrowDown")).toBeUndefined();
    expect(press("Enter")).toBeUndefined();
    expect(press("ArrowDown", {}, "grid")).toBe("row-down");
    expect(press("ArrowUp", {}, "grid")).toBe("row-up");
    expect(press("Enter", {}, "grid")).toBe("open-selected");
    // Fit and 1:1 mean nothing over a grid of tiles.
    expect(press("0", {}, "grid")).toBeUndefined();
    expect(press("+", {}, "grid")).toBe("zoom-in");
    // The slideshow has no controls to toggle: only stepping, copy and leaving.
    expect(press("ArrowRight", {}, "slideshow")).toBe("next");
    expect(press("f", {}, "slideshow")).toBe("slideshow");
    expect(press("g", {}, "slideshow")).toBeUndefined();
    expect(press("+", {}, "slideshow")).toBeUndefined();
  });

  it("copies on ⌘C and Ctrl+C, but not on a bare C", () => {
    expect(press("c", { metaKey: true })).toBe("copy");
    expect(press("C", { ctrlKey: true })).toBe("copy");
    expect(press("c")).toBeUndefined();
  });

  it("leaves ⌘+ / ⌘− to the browser's page zoom", () => {
    expect(press("+", { metaKey: true })).toBeUndefined();
    expect(press("-", { ctrlKey: true })).toBeUndefined();
    expect(press("0", { altKey: true })).toBeUndefined();
  });

  it("ignores keys it has no use for", () => {
    expect(press("a")).toBeUndefined();
    expect(press("Tab")).toBeUndefined();
  });
});

describe("VIEWER_KEYS", () => {
  it("has exactly one row per action, each with key caps and a description", () => {
    const actions: ViewerAction[] = [
      "close",
      "zoom-in",
      "zoom-out",
      "fit",
      "actual-size",
      "previous",
      "next",
      "copy",
      "shortcuts",
      "toggle-strip",
      "toggle-grid",
      "slideshow",
      "row-up",
      "row-down",
      "open-selected",
    ];
    expect(VIEWER_KEYS.map((k) => k.action).sort()).toEqual(
      [...actions].sort(),
    );
    for (const a of actions) {
      const k = viewerKey(a);
      expect(k.caps.length).toBeGreaterThan(0);
      expect(k.description.length).toBeGreaterThan(0);
      expect(k.in.length).toBeGreaterThan(0);
    }
  });
});
