import { describe, expect, it } from "bun:test";
import { Color, inGamut, maxChroma } from "./color";

/** Every gamma-encoded sRGB channel of `a` within `tol` of `b`'s. */
function expectNearSrgb(a: Color, b: Color, tol: number): void {
  const sa = a.toSrgb();
  const sb = b.toSrgb();
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(sa[i]! - sb[i]!)).toBeLessThanOrEqual(tol);
  }
}

const SAMPLE_HEXES = [
  "#000000",
  "#ffffff",
  "#7c5cff",
  "#3b82f6",
  "#10b981",
  "#f0614b",
  "#22212a",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#0000ff",
];

describe("hex ↔ oklch ↔ hsl round-trips", () => {
  it("hex → Color → hex is the identity", () => {
    for (const hex of SAMPLE_HEXES) {
      expect(Color.fromHex(hex).toHex()).toBe(hex);
    }
  });

  it("hex → oklch() string → hex survives the string's rounding (±1 step)", () => {
    for (const hex of SAMPLE_HEXES) {
      const back = Color.fromCss(Color.fromHex(hex).toOklch());
      expect(back).not.toBeNull();
      expectNearSrgb(back!, Color.fromHex(hex), 1.5 / 255);
    }
  });

  it("hex → HSL parts → hex is the identity", () => {
    for (const hex of SAMPLE_HEXES) {
      const [h, s, l] = Color.fromHex(hex).toHslParts();
      expect(Color.fromHsl(h, s, l).toHex()).toBe(hex);
    }
  });

  it("hsl() strings parse to the colour they name", () => {
    expect(Color.fromCss("hsl(0 100% 50%)")?.toHex()).toBe("#ff0000");
    expect(Color.fromCss("hsl(120, 100%, 50%)")?.toHex()).toBe("#00ff00");
    expect(Color.fromCss("hsla(240deg, 100%, 50%, 0.5)")?.toHex()).toBe(
      "#0000ff80",
    );
    expect(Color.fromCss("hsl(240 100% 50% / 50%)")?.alpha).toBeCloseTo(0.5);
  });

  it("toHsl() round-trips through fromCss", () => {
    for (const hex of SAMPLE_HEXES) {
      const css = Color.fromHex(hex).toHsl();
      const back = Color.fromCss(css);
      expect(back).not.toBeNull();
      // toHsl rounds to whole percents: a few 8-bit steps per channel.
      expectNearSrgb(back!, Color.fromHex(hex), 0.02);
    }
  });

  it("a grey has hue 0 and HSL saturation 0", () => {
    const grey = Color.fromHex("#808080");
    expect(grey.h).toBe(0);
    expect(grey.toHslParts()[1]).toBe(0);
    expect(grey.toHsl()).toBe("hsl(0 0% 50%)");
  });

  it("short hex expands", () => {
    expect(Color.fromCss("#f00")?.toHex()).toBe("#ff0000");
    expect(Color.fromCss("#f008")?.toHex()).toBe("#ff000088");
  });
});

describe("fromCss tolerance", () => {
  it("accepts % lightness and deg hue on oklch()", () => {
    const a = Color.fromCss("oklch(62.3% 0.214 259.1deg)");
    const b = Color.fromCss("oklch(0.623 0.214 259.1)");
    expect(a).not.toBeNull();
    expect(a!.equals(b!)).toBe(true);
  });

  it("reads rgb() and rgba()", () => {
    expect(Color.fromCss("rgb(255, 0, 0)")?.toHex()).toBe("#ff0000");
    expect(Color.fromCss("rgba(0 0 255 / 0.5)")?.alpha).toBeCloseTo(0.5);
  });

  it("is null for anything that is not a literal color", () => {
    for (const s of [
      "var(--accent)",
      "calc(1px + 2px)",
      "Inter",
      "ui-sans-serif, system-ui",
      "hsl(var(--x))",
      "#12",
      "#gggggg",
      "",
    ]) {
      expect(Color.fromCss(s)).toBeNull();
    }
  });

  it("fromHex throws on a non-hex string", () => {
    expect(() => Color.fromHex("nope")).toThrow();
  });
});

describe("gamut", () => {
  it("maxChroma is in gamut, and a hair more is not", () => {
    for (const l of [0.05, 0.2, 0.4, 0.6, 0.75, 0.9, 0.97]) {
      for (const h of [0, 30, 90, 145, 200, 264, 330]) {
        const edge = maxChroma(l, h);
        expect(inGamut(l, edge, h)).toBe(true);
        expect(inGamut(l, edge + 0.002, h)).toBe(false);
      }
    }
  });

  it("the top and bottom rows are white and black all the way across", () => {
    for (const h of [0, 120, 264]) {
      expectNearSrgb(
        Color.fromOklch(0, maxChroma(0, h), h),
        Color.fromHex("#000000"),
        2 / 255,
      );
      expectNearSrgb(
        Color.fromOklch(1, maxChroma(1, h), h),
        Color.fromHex("#ffffff"),
        2 / 255,
      );
    }
  });

  it("every sRGB hex is in gamut", () => {
    for (const hex of SAMPLE_HEXES) {
      expect(Color.fromHex(hex).inGamut()).toBe(true);
    }
  });

  it("fitted() clamps an out-of-gamut chroma onto the edge", () => {
    const wild = Color.fromOklch(0.7, 0.4, 150);
    expect(wild.inGamut()).toBe(false);
    const fit = wild.fitted();
    expect(fit.inGamut()).toBe(true);
    expect(fit.c).toBeCloseTo(maxChroma(0.7, 150), 5);
    const tame = Color.fromOklch(0.7, 0.05, 150);
    expect(tame.fitted()).toBe(tame);
  });
});

describe("equals", () => {
  it("compares hue around the circle", () => {
    expect(
      Color.fromOklch(0.6, 0.1, 359.9).equals(Color.fromOklch(0.6, 0.1, 0.1)),
    ).toBe(true);
  });

  it("ignores hue on greys", () => {
    expect(
      Color.fromOklch(0.5, 0, 10).equals(Color.fromOklch(0.5, 0, 200)),
    ).toBe(true);
  });
});
