import { describe, expect, test } from "bun:test";
import { EmojiSchema, isEmoji } from "./emoji";

describe("isEmoji", () => {
  test.each([
    ["simple", "🚀"],
    ["ZWJ family", "👨‍👩‍👧‍👦"],
    ["skin tone", "👍🏽"],
    ["flag", "🇫🇷"],
    ["keycap", "1️⃣"],
    ["VS16 (map)", "🗺️"],
    ["ZWJ pirate flag", "🏴‍☠️"],
  ])("accepts %s", (_label, s) => {
    expect(isEmoji(s)).toBe(true);
  });

  test.each([
    ["letters", "ab"],
    ["a word", "rocket"],
    ["empty", ""],
    ["two emoji", "🚀🚀"],
    ["emoji plus text", "🚀x"],
    ["a digit", "1"],
    ["whitespace around", " 🚀"],
  ])("rejects %s", (_label, s) => {
    expect(isEmoji(s)).toBe(false);
  });
});

describe("EmojiSchema", () => {
  test("parses an emoji", () => {
    expect<string>(EmojiSchema.parse("🧪")).toBe("🧪");
  });
  test("rejects a symbol name", () => {
    expect(EmojiSchema.safeParse("description").success).toBe(false);
  });
});
