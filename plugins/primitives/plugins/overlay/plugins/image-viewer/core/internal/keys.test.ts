import { describe, expect, it } from "bun:test";
import {
  VIEWER_KEYS,
  matchViewerKey,
  viewerKey,
  type ViewerAction,
} from "./keys";

const press = (
  key: string,
  mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {},
) =>
  matchViewerKey({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...mods,
  });

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
    ];
    expect(VIEWER_KEYS.map((k) => k.action).sort()).toEqual(
      [...actions].sort(),
    );
    for (const a of actions) {
      const k = viewerKey(a);
      expect(k.caps.length).toBeGreaterThan(0);
      expect(k.description.length).toBeGreaterThan(0);
    }
  });
});
