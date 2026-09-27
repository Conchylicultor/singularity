import { describe, expect, it } from "bun:test";
import {
  ALL_STYLE_KEYS,
  DEFAULT_ICON_STYLE,
  DEFAULT_STYLE_KEYS,
  iconifyName,
  parseStyleKey,
  styleKeyOf,
} from "./style";

describe("icon style keys", () => {
  it("names the default style's two sprites", () => {
    expect(DEFAULT_STYLE_KEYS).toEqual([
      "default-outline-400",
      "default-filled-400",
    ]);
    expect(styleKeyOf(DEFAULT_ICON_STYLE, true)).toBe("default-filled-400");
  });

  it("round-trips every key through parseStyleKey", () => {
    expect(ALL_STYLE_KEYS).toHaveLength(12);
    for (const key of ALL_STYLE_KEYS) {
      const { shape, fill, weight } = parseStyleKey(key);
      expect(styleKeyOf({ shape, fill, activeFill: fill, weight }, false)).toBe(
        key,
      );
    }
  });

  it("spells Iconify's variant suffixes", () => {
    expect(iconifyName("forum", "default", "filled")).toBe("forum");
    expect(iconifyName("forum", "default", "outline")).toBe("forum-outline");
    expect(iconifyName("forum", "rounded", "filled")).toBe("forum-rounded");
    expect(iconifyName("forum", "rounded", "outline")).toBe(
      "forum-outline-rounded",
    );
    expect(iconifyName("forum", "sharp", "outline")).toBe(
      "forum-outline-sharp",
    );
  });
});
