// OKLCH ↔ OKLab ↔ linear-sRGB ↔ sRGB ↔ hex conversions (CSS Color Level 4).

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function gammaToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToGamma(c: number): number {
  return c <= 0.0031308
    ? 12.92 * c
    : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
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
  let h = Math.atan2(b, a) * RAD;
  if (h < 0) h += 360;
  return [l, c, h];
}

function hexByte(v: number): string {
  return Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, "0");
}

function parseHexChannel(hex: string, offset: number): number {
  return parseInt(hex.slice(offset, offset + 2), 16) / 255;
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

  static fromOklch(
    l: number,
    c: number,
    h: number,
    alpha: number = 1,
  ): Color {
    return new Color(l, Math.max(0, c), ((h % 360) + 360) % 360, clamp01(alpha));
  }

  static fromHex(hex: string): Color {
    const h = hex.startsWith("#") ? hex.slice(1) : hex;
    if (h.length !== 6 && h.length !== 8) {
      return new Color(0, 0, 0, 1);
    }
    const r = parseHexChannel(h, 0);
    const g = parseHexChannel(h, 2);
    const b = parseHexChannel(h, 4);
    const a = h.length === 8 ? parseHexChannel(h, 6) : 1;

    const lr = gammaToLinear(r);
    const lg = gammaToLinear(g);
    const lb = gammaToLinear(b);

    const [ol, oa, ob] = linearSrgbToOklab(lr, lg, lb);
    const [ll, cc, hh] = oklabToOklch(ol, oa, ob);
    return new Color(ll, cc, hh, a);
  }

  static fromCss(css: string): Color | null {
    const s = css.trim().toLowerCase();

    if (s.startsWith("#")) {
      const h = s.slice(1);
      if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) {
        return Color.fromHex(s);
      }
      return null;
    }

    const oklchMatch = s.match(
      /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/,
    );
    if (oklchMatch) {
      return Color.fromOklch(
        parseFloat(oklchMatch[1]!),
        parseFloat(oklchMatch[2]!),
        parseFloat(oklchMatch[3]!),
        oklchMatch[4] != null ? parseFloat(oklchMatch[4]) : 1,
      );
    }

    const rgbMatch = s.match(
      /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
    );
    if (rgbMatch) {
      const r = parseFloat(rgbMatch[1]!) / 255;
      const g = parseFloat(rgbMatch[2]!) / 255;
      const b = parseFloat(rgbMatch[3]!) / 255;
      const a = rgbMatch[4] != null ? parseFloat(rgbMatch[4]) : 1;
      const lr = gammaToLinear(r);
      const lg = gammaToLinear(g);
      const lb = gammaToLinear(b);
      const [ol, oa, ob] = linearSrgbToOklab(lr, lg, lb);
      const [ll, cc, hh] = oklabToOklch(ol, oa, ob);
      return new Color(ll, cc, hh, a);
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

  toHsl(): string {
    const [r, g, b] = this.toSrgb();
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const ll = (max + min) / 2;
    if (max === min) {
      return `hsl(0 0% ${Math.round(ll * 100)}%)`;
    }
    const d = max - min;
    const s = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(ll * 100)}%)`;
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

  equals(other: Color): boolean {
    const eps = 0.001;
    return (
      Math.abs(this.l - other.l) < eps &&
      Math.abs(this.c - other.c) < eps &&
      Math.abs(this.h - other.h) < 0.5 &&
      Math.abs(this.alpha - other.alpha) < eps
    );
  }
}

export const MAX_CHROMA = 0.4;
