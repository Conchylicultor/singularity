import { describe, expect, it } from "bun:test";
import { Color } from "../../core";
import {
  channelsFor,
  formatColor,
  parseNumber,
  putNumber,
  showNumber,
  type Channel,
  type NumberChannel,
  type TextChannel,
} from "./channels";

function numberChannel(
  channels: readonly Channel[],
  key: string,
): NumberChannel {
  const ch = channels.find((c) => c.key === key);
  if (ch?.kind !== "number") throw new Error(`no number channel ${key}`);
  return ch;
}

function textChannel(channels: readonly Channel[]): TextChannel {
  const ch = channels[0];
  if (ch?.kind !== "text") throw new Error("no text channel");
  return ch;
}

const VIOLET = Color.fromHex("#7c5cff");

describe("channelsFor", () => {
  it("lists each format's fields, plus opacity on request", () => {
    expect(channelsFor("oklch", false).map((c) => c.key)).toEqual([
      "L",
      "C",
      "H",
    ]);
    expect(channelsFor("hsl", false).map((c) => c.key)).toEqual([
      "H",
      "S",
      "L",
    ]);
    expect(channelsFor("hex", false).map((c) => c.key)).toEqual(["#"]);
    expect(channelsFor("hsl", true).map((c) => c.key)).toEqual([
      "H",
      "S",
      "L",
      "A",
    ]);
  });
});

describe("oklch channels", () => {
  const chs = channelsFor("oklch", false);

  it("read L as a percent, C raw, H in degrees", () => {
    const c = Color.fromOklch(0.6234, 0.2, 280.4);
    expect(showNumber(numberChannel(chs, "L"), c)).toBe("62.3");
    expect(showNumber(numberChannel(chs, "C"), c)).toBe("0.2");
    expect(showNumber(numberChannel(chs, "H"), c)).toBe("280");
  });

  it("clamp to the range, and wrap the hue", () => {
    const L = numberChannel(chs, "L");
    const H = numberChannel(chs, "H");
    expect(putNumber(L, VIOLET, 140).l).toBeCloseTo(1);
    expect(putNumber(L, VIOLET, -5).l).toBeCloseTo(0);
    expect(putNumber(H, VIOLET, 370).h).toBeCloseTo(10);
    expect(putNumber(H, VIOLET, -10).h).toBeCloseTo(350);
  });

  it("keep chroma inside the gamut", () => {
    const C = numberChannel(chs, "C");
    const L = numberChannel(chs, "L");
    const wide = putNumber(C, VIOLET, 0.37);
    expect(wide.inGamut()).toBe(true);
    const bright = putNumber(L, VIOLET, 97);
    expect(bright.inGamut()).toBe(true);
  });

  it("a hue that rounds up to 360 shows as 0", () => {
    expect(
      showNumber(numberChannel(chs, "H"), Color.fromOklch(0.5, 0.1, 359.8)),
    ).toBe("0");
  });
});

describe("hsl channels", () => {
  const chs = channelsFor("hsl", true);

  it("read and write saturation and lightness, keeping alpha", () => {
    const red = Color.fromHex("#ff0000").withAlpha(0.5);
    expect(showNumber(numberChannel(chs, "H"), red)).toBe("0");
    expect(showNumber(numberChannel(chs, "S"), red)).toBe("100");
    expect(showNumber(numberChannel(chs, "L"), red)).toBe("50");
    const darker = putNumber(numberChannel(chs, "L"), red, 25);
    expect(darker.withAlpha(1).toHex()).toBe("#800000");
    expect(darker.alpha).toBeCloseTo(0.5);
  });

  it("A writes opacity as a percent", () => {
    expect(putNumber(numberChannel(chs, "A"), VIOLET, 40).alpha).toBeCloseTo(
      0.4,
    );
    expect(putNumber(numberChannel(chs, "A"), VIOLET, 400).alpha).toBe(1);
  });
});

describe("hex channel", () => {
  const ch = textChannel(channelsFor("hex", false));

  it("shows six digits, no #", () => {
    expect(ch.get(VIOLET)).toBe("7c5cff");
  });

  it("parses a full hex with or without #, keeping alpha", () => {
    const half = VIOLET.withAlpha(0.5);
    expect(ch.parse(half, "#3b82f6")?.withAlpha(1).toHex()).toBe("#3b82f6");
    expect(ch.parse(half, "3B82F6")?.alpha).toBeCloseTo(0.5);
    expect(ch.parse(half, "3b82f")).toBeNull();
  });
});

describe("parseNumber", () => {
  it("accepts numbers, rejects partial input", () => {
    expect(parseNumber("12")).toBe(12);
    expect(parseNumber(" 0.25 ")).toBe(0.25);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("-3")).toBe(-3);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("1e3")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("formatColor", () => {
  it("writes each format", () => {
    expect(formatColor(VIOLET, "hex")).toBe("#7c5cff");
    expect(formatColor(VIOLET, "oklch")).toMatch(/^oklch\(/);
    expect(formatColor(VIOLET, "hsl")).toMatch(/^hsl\(/);
  });
});
