import { Color, maxChroma } from "../../core";

/** The value formats the picker reads and writes. */
export type ColorFormat = "hex" | "oklch" | "hsl";
export const COLOR_FORMATS: readonly ColorFormat[] = ["hex", "oklch", "hsl"];

export function isColorFormat(v: unknown): v is ColorFormat {
  return (
    typeof v === "string" && (COLOR_FORMATS as readonly string[]).includes(v)
  );
}

/** The color as text in `format` — what Copy puts on the clipboard. */
export function formatColor(color: Color, format: ColorFormat): string {
  if (format === "oklch") return color.toOklch();
  if (format === "hsl") return color.toHsl();
  return color.toHex();
}

/**
 * One numeric channel field: its letter (drag it to scrub), how to read it off
 * a color, how to write it back, its range, the step one arrow press / two
 * scrubbed pixels move it by, and the decimals shown.
 */
export interface NumberChannel {
  kind: "number";
  /** The letter on the field — also its scrub handle. */
  key: string;
  /** Accessible name of the field. */
  label: string;
  unit?: "%" | "°";
  min: number;
  max: number;
  step: number;
  /** Decimals shown. */
  dp: number;
  /** Hue: wraps around the circle instead of clamping. */
  wrap?: boolean;
  get: (color: Color) => number;
  /** Write an in-range value back. Called through {@link putNumber}, which clamps / wraps first. */
  put: (color: Color, value: number) => Color;
}

/** The hex field: one text field, no scrubbing. */
export interface TextChannel {
  kind: "text";
  key: "#";
  label: string;
  get: (color: Color) => string;
  /** The color `raw` names (keeping `color`'s alpha), or null while it is not a full hex yet. */
  parse: (color: Color, raw: string) => Color | null;
}

export type Channel = NumberChannel | TextChannel;

/** Chroma above the sRGB edge of a lightness row and hue is not displayable: pull it in. */
function fit(color: Color): Color {
  return color.fitted();
}

const OKLCH: readonly Channel[] = [
  {
    kind: "number",
    key: "L",
    label: "Lightness",
    unit: "%",
    min: 0,
    max: 100,
    step: 0.5,
    dp: 1,
    get: (c) => c.l * 100,
    put: (c, v) => fit(c.withLightness(v / 100)),
  },
  {
    kind: "number",
    key: "C",
    label: "Chroma",
    min: 0,
    max: 0.37,
    step: 0.002,
    dp: 3,
    get: (c) => c.c,
    put: (c, v) => c.withChroma(Math.min(v, maxChroma(c.l, c.h))),
  },
  {
    kind: "number",
    key: "H",
    label: "Hue",
    unit: "°",
    min: 0,
    max: 360,
    step: 1,
    dp: 0,
    wrap: true,
    get: (c) => c.h,
    put: (c, v) => fit(c.withHue(v)),
  },
];

const HSL: readonly Channel[] = [
  {
    kind: "number",
    key: "H",
    label: "Hue",
    unit: "°",
    min: 0,
    max: 360,
    step: 1,
    dp: 0,
    wrap: true,
    get: (c) => c.toHslParts()[0],
    put: (c, v) => {
      const [, s, l] = c.toHslParts();
      return Color.fromHsl(v, s, l, c.alpha);
    },
  },
  {
    kind: "number",
    key: "S",
    label: "Saturation",
    unit: "%",
    min: 0,
    max: 100,
    step: 1,
    dp: 0,
    get: (c) => c.toHslParts()[1],
    put: (c, v) => {
      const [h, , l] = c.toHslParts();
      return Color.fromHsl(h, v, l, c.alpha);
    },
  },
  {
    kind: "number",
    key: "L",
    label: "Lightness",
    unit: "%",
    min: 0,
    max: 100,
    step: 1,
    dp: 0,
    get: (c) => c.toHslParts()[2],
    put: (c, v) => {
      const [h, s] = c.toHslParts();
      return Color.fromHsl(h, s, v, c.alpha);
    },
  },
];

const HEX: readonly Channel[] = [
  {
    kind: "text",
    key: "#",
    label: "Hex",
    get: (c) => c.withAlpha(1).toHex().slice(1),
    parse: (c, raw) => {
      const s = raw.trim();
      return /^#?[0-9a-f]{6}$/i.test(s)
        ? Color.fromHex(s).withAlpha(c.alpha)
        : null;
    },
  },
];

const ALPHA: Channel = {
  kind: "number",
  key: "A",
  label: "Opacity",
  unit: "%",
  min: 0,
  max: 100,
  step: 1,
  dp: 0,
  get: (c) => c.alpha * 100,
  put: (c, v) => c.withAlpha(v / 100),
};

const BY_FORMAT: Record<ColorFormat, readonly Channel[]> = {
  oklch: OKLCH,
  hsl: HSL,
  hex: HEX,
};

/** The fields a format shows, plus opacity when the caller edits alpha. */
export function channelsFor(
  format: ColorFormat,
  showAlpha: boolean,
): readonly Channel[] {
  return showAlpha ? [...BY_FORMAT[format], ALPHA] : BY_FORMAT[format];
}

/** Write `value` into `color` through `ch`, clamped to its range (hue wraps). */
export function putNumber(
  ch: NumberChannel,
  color: Color,
  value: number,
): Color {
  const v = ch.wrap
    ? ((value % 360) + 360) % 360
    : Math.max(ch.min, Math.min(ch.max, value));
  return ch.put(color, v);
}

/** `ch`'s value on `color`, as the field shows it. */
export function showNumber(ch: NumberChannel, color: Color): string {
  // `+toFixed` drops trailing zeros; a wrapped hue rounding up to 360 reads 0.
  const v = +ch.get(color).toFixed(ch.dp);
  return String(ch.wrap && v >= 360 ? 0 : v);
}

/** A typed field value as a number, or null while it is not one yet. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim();
  if (s === "" || !/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}
