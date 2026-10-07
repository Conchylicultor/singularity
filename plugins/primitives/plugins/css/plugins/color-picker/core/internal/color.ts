// OKLCH ↔ OKLab ↔ linear-sRGB ↔ sRGB ↔ hex / HSL conversions (CSS Color Level 4),
// plus the sRGB gamut boundary in OKLCH. Pure TS — no DOM, no React.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Linear-sRGB slack a channel may overshoot [0, 1] by and still count as in gamut. */
const GAMUT_EPS = 1e-4;
/** Upper bound of the chroma search: above every displayable sRGB chroma (~0.32). */
const CHROMA_CEILING = 0.37;
/** Below this chroma a color is grey, and its hue carries no information. */
const ACHROMATIC = 1e-4;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function gammaToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToGamma(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function oklchToOklab(
  l: number,
  c: number,
  h: number,
): [number, number, number] {
  const hRad = h * DEG;
  return [l, c * Math.cos(hRad), c * Math.sin(hRad)];
}

function oklabToLinearSrgb(
  l: number,
  a: number,
  b: number,
): [number, number, number] {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const ll = l_ * l_ * l_;
  const mm = m_ * m_ * m_;
  const ss = s_ * s_ * s_;

  return [
    +4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss,
  ];
}

function linearSrgbToOklab(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToOklch(
  l: number,
  a: number,
  b: number,
): [number, number, number] {
  const c = Math.sqrt(a * a + b * b);
  if (c < ACHROMATIC) return [l, c, 0];
  let h = Math.atan2(b, a) * RAD;
  if (h < 0) h += 360;
  return [l, c, h];
}

/** Gamma-encoded sRGB channels (0..1) → OKLCH. */
function srgbToOklch(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const [ol, oa, ob] = linearSrgbToOklab(
    gammaToLinear(r),
    gammaToLinear(g),
    gammaToLinear(b),
  );
  return oklabToOklch(ol, oa, ob);
}

/** HSL (h in degrees, s and l in 0..1) → gamma-encoded sRGB channels. */
function hslToSrgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

function hexByte(v: number): string {
  return Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, "0");
}

function parseHexChannel(hex: string, offset: number): number {
  return parseInt(hex.slice(offset, offset + 2), 16) / 255;
}

/**
 * Is `oklch(l c h)` inside the sRGB gamut — i.e. a color a screen shows as-is,
 * rather than clipped to a look-alike?
 */
export function inGamut(l: number, c: number, h: number): boolean {
  const [ol, oa, ob] = oklchToOklab(l, c, h);
  return oklabToLinearSrgb(ol, oa, ob).every(
    (v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS,
  );
}

/**
 * The largest chroma `oklch(l · h)` reaches inside sRGB: the gamut edge of
 * that lightness row. A binary search on linear sRGB, so the result is itself
 * in gamut (to within 1e-6 of the true edge).
 */
export function maxChroma(l: number, h: number): number {
  if (inGamut(l, CHROMA_CEILING, h)) return CHROMA_CEILING;
  let lo = 0;
  let hi = CHROMA_CEILING;
  while (hi - lo > 1e-6) {
    const mid = (lo + hi) / 2;
    if (inGamut(l, mid, h)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** A number token with an optional unit, as CSS colour functions write them. */
const NUM = String.raw`(-?[\d.]+)`;
const SEP = String.raw`(?:\s*,\s*|\s+)`;
const ALPHA = String.raw`(?:\s*[,/]\s*([\d.]+%?))?`;

/** An alpha token — a 0..1 number or a percentage. */
function parseAlpha(token: string | undefined): number {
  if (token == null) return 1;
  return token.endsWith("%") ? parseFloat(token) / 100 : parseFloat(token);
}

export class Color {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;

  private constructor(l: number, c: number, h: number, alpha: number) {
    this.l = l;
    this.c = c;
    this.h = h;
    this.alpha = alpha;
  }

  static fromOklch(l: number, c: number, h: number, alpha: number = 1): Color {
    return new Color(
      l,
      Math.max(0, c),
      ((h % 360) + 360) % 360,
      clamp01(alpha),
    );
  }

  /** Gamma-encoded sRGB channels in 0..1. */
  static fromSrgb(r: number, g: number, b: number, alpha: number = 1): Color {
    const [l, c, h] = srgbToOklch(r, g, b);
    return new Color(l, c, h, clamp01(alpha));
  }

  /**
   * HSL with the hue in degrees and saturation / lightness in PERCENT (0..100),
   * the units `hsl()` and the picker's channel fields write.
   */
  static fromHsl(h: number, s: number, l: number, alpha: number = 1): Color {
    const [r, g, b] = hslToSrgb(
      ((h % 360) + 360) % 360,
      clamp01(s / 100),
      clamp01(l / 100),
    );
    return Color.fromSrgb(r, g, b, alpha);
  }

  /** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` (the `#` optional). Throws on anything else. */
  static fromHex(hex: string): Color {
    let h = hex.startsWith("#") ? hex.slice(1) : hex;
    if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) {
      throw new Error(`Color.fromHex: not a hex color: ${JSON.stringify(hex)}`);
    }
    if (h.length <= 4) h = [...h].map((ch) => ch + ch).join("");
    return Color.fromSrgb(
      parseHexChannel(h, 0),
      parseHexChannel(h, 2),
      parseHexChannel(h, 4),
      h.length === 8 ? parseHexChannel(h, 6) : 1,
    );
  }

  /**
   * Parse a literal CSS color: hex, `oklch()`, `rgb()/rgba()`, `hsl()/hsla()`
   * (comma or space syntax, `%` on lightness / alpha, `deg` on hues). `null`
   * for anything else — a `var()`, a `calc()`, a font name — so a caller can
   * tell a color token from a non-color one.
   */
  static fromCss(css: string): Color | null {
    const s = css.trim().toLowerCase();

    if (s.startsWith("#")) {
      return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)
        ? Color.fromHex(s)
        : null;
    }

    const oklchMatch = s.match(
      new RegExp(
        String.raw`^oklch\(\s*${NUM}(%?)\s+${NUM}\s+${NUM}(?:deg)?\s*(?:/\s*([\d.]+%?))?\s*\)$`,
      ),
    );
    if (oklchMatch) {
      const l = parseFloat(oklchMatch[1]!);
      return Color.fromOklch(
        oklchMatch[2] === "%" ? l / 100 : l,
        parseFloat(oklchMatch[3]!),
        parseFloat(oklchMatch[4]!),
        parseAlpha(oklchMatch[5]),
      );
    }

    const rgbMatch = s.match(
      new RegExp(
        String.raw`^rgba?\(\s*${NUM}${SEP}${NUM}${SEP}${NUM}${ALPHA}\s*\)$`,
      ),
    );
    if (rgbMatch) {
      return Color.fromSrgb(
        clamp01(parseFloat(rgbMatch[1]!) / 255),
        clamp01(parseFloat(rgbMatch[2]!) / 255),
        clamp01(parseFloat(rgbMatch[3]!) / 255),
        parseAlpha(rgbMatch[4]),
      );
    }

    const hslMatch = s.match(
      new RegExp(
        String.raw`^hsla?\(\s*${NUM}(?:deg)?${SEP}${NUM}%${SEP}${NUM}%${ALPHA}\s*\)$`,
      ),
    );
    if (hslMatch) {
      return Color.fromHsl(
        parseFloat(hslMatch[1]!),
        parseFloat(hslMatch[2]!),
        parseFloat(hslMatch[3]!),
        parseAlpha(hslMatch[4]),
      );
    }

    return null;
  }

  toLinearSrgb(): [number, number, number] {
    const [ol, oa, ob] = oklchToOklab(this.l, this.c, this.h);
    return oklabToLinearSrgb(ol, oa, ob);
  }

  toSrgb(): [number, number, number] {
    const [lr, lg, lb] = this.toLinearSrgb();
    return [
      clamp01(linearToGamma(lr)),
      clamp01(linearToGamma(lg)),
      clamp01(linearToGamma(lb)),
    ];
  }

  /** Is this color inside sRGB (see {@link inGamut})? */
  inGamut(): boolean {
    return inGamut(this.l, this.c, this.h);
  }

  /** This color with its chroma clamped to the sRGB edge of its lightness row and hue. */
  fitted(): Color {
    const edge = maxChroma(this.l, this.h);
    return this.c <= edge ? this : this.withChroma(edge);
  }

  toHex(): string {
    const [r, g, b] = this.toSrgb();
    const base = `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
    if (this.alpha < 1) return `${base}${hexByte(this.alpha)}`;
    return base;
  }

  toOklch(): string {
    const l = Math.round(this.l * 1000) / 1000;
    const c = Math.round(this.c * 1000) / 1000;
    const h = Math.round(this.h * 10) / 10;
    if (this.alpha < 1) {
      const a = Math.round(this.alpha * 100) / 100;
      return `oklch(${l} ${c} ${h} / ${a})`;
    }
    return `oklch(${l} ${c} ${h})`;
  }

  /**
   * `[hue°, saturation %, lightness %]`, unrounded. A grey has no HSL hue; it
   * reports its OKLCH hue as a stand-in, so a saturation edit away from grey
   * keeps heading the way the user was going.
   */
  toHslParts(): [number, number, number] {
    const [r, g, b] = this.toSrgb();
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const ll = (max + min) / 2;
    const d = max - min;
    // Below a hundredth of an 8-bit step the spread is conversion noise: grey.
    if (d < 1e-5) return [this.h, 0, ll * 100];
    const s = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s * 100, ll * 100];
  }

  toHsl(): string {
    const [h, s, l] = this.toHslParts();
    const hue = s === 0 ? 0 : Math.round(h) % 360;
    const base = `${hue} ${Math.round(s)}% ${Math.round(l)}%`;
    if (this.alpha < 1) {
      return `hsl(${base} / ${Math.round(this.alpha * 100) / 100})`;
    }
    return `hsl(${base})`;
  }

  withHue(h: number): Color {
    return Color.fromOklch(this.l, this.c, h, this.alpha);
  }

  withLightness(l: number): Color {
    return Color.fromOklch(l, this.c, this.h, this.alpha);
  }

  withChroma(c: number): Color {
    return Color.fromOklch(this.l, c, this.h, this.alpha);
  }

  withAlpha(a: number): Color {
    return Color.fromOklch(this.l, this.c, this.h, a);
  }

  /**
   * Perceptually the same color, within display rounding. Hue is compared
   * around the circle, and ignored for greys (where it carries no information).
   */
  equals(other: Color): boolean {
    const eps = 0.001;
    const dh = Math.abs(this.h - other.h) % 360;
    const hueClose =
      (this.c < 0.002 && other.c < 0.002) || Math.min(dh, 360 - dh) < 0.5;
    return (
      Math.abs(this.l - other.l) < eps &&
      Math.abs(this.c - other.c) < eps &&
      hueClose &&
      Math.abs(this.alpha - other.alpha) < eps
    );
  }
}
