/**
 * The icon style vocabulary: the axes a theme picks (shape × fill × weight) and
 * the sprite key a combination is served under. Pure data, so the token group,
 * the sprite server and `<Icon>` agree on one spelling.
 */

export const ICON_SHAPES = ["default", "rounded", "sharp"] as const;
export type IconShape = (typeof ICON_SHAPES)[number];

export const ICON_FILLS = ["outline", "filled"] as const;
export type IconFill = (typeof ICON_FILLS)[number];

/** `regular` is Material Symbols (weight 400); `light` is Material Symbols Light (300). */
export const ICON_WEIGHTS = ["regular", "light"] as const;
export type IconWeight = (typeof ICON_WEIGHTS)[number];

const WEIGHT_NUMBER = { regular: 400, light: 300 } as const;
type WeightNumber = (typeof WEIGHT_NUMBER)[IconWeight];

/** What one theme scope says about its icons. */
export interface IconStyle {
  shape: IconShape;
  /** The fill of an icon at rest. */
  fill: IconFill;
  /** The fill of an icon drawn `active` (a selected nav item, a pinned row). */
  activeFill: IconFill;
  weight: IconWeight;
}

/** The global default: outline, filled when active, regular weight, default shape. */
export const DEFAULT_ICON_STYLE: IconStyle = {
  shape: "default",
  fill: "outline",
  activeFill: "filled",
  weight: "regular",
};

/** One sprite: every manifest symbol drawn in one shape × fill × weight (e.g. `default-outline-400`). */
export type StyleKey = `${IconShape}-${IconFill}-${WeightNumber}`;

/** The sprite key an icon in `style` draws from, at rest or `active`. */
export function styleKeyOf(style: IconStyle, active: boolean): StyleKey {
  const fill = active ? style.activeFill : style.fill;
  return `${style.shape}-${fill}-${WEIGHT_NUMBER[style.weight]}`;
}

/** Every style key, in a stable order. */
export const ALL_STYLE_KEYS: readonly StyleKey[] = ICON_WEIGHTS.flatMap((w) =>
  ICON_SHAPES.flatMap((s) =>
    ICON_FILLS.map((f): StyleKey => `${s}-${f}-${WEIGHT_NUMBER[w]}`),
  ),
);

export function isStyleKey(key: string): key is StyleKey {
  return (ALL_STYLE_KEYS as readonly string[]).includes(key);
}

/** The axes a style key encodes. */
export function parseStyleKey(key: StyleKey): {
  shape: IconShape;
  fill: IconFill;
  weight: IconWeight;
} {
  const [shape, fill, weight] = key.split("-") as [IconShape, IconFill, string];
  return { shape, fill, weight: weight === "300" ? "light" : "regular" };
}

/** The keys the default style draws from: the resident sprites, present at first paint. */
export const DEFAULT_STYLE_KEYS: readonly StyleKey[] = [
  styleKeyOf(DEFAULT_ICON_STYLE, false),
  styleKeyOf(DEFAULT_ICON_STYLE, true),
];

/**
 * The Iconify name of a base symbol in one shape × fill. Iconify spells the
 * filled default as the bare name and the rest as suffixes:
 * `-outline`, `-rounded`, `-outline-rounded`, `-sharp`, `-outline-sharp`.
 */
export function iconifyName(
  name: string,
  shape: IconShape,
  fill: IconFill,
): string {
  const outline = fill === "outline" ? "-outline" : "";
  const shapeSuffix = shape === "default" ? "" : `-${shape}`;
  return `${name}${outline}${shapeSuffix}`;
}

/** The sprite `<symbol>` id of a Material Symbols icon in one style. */
export function symbolId(styleKey: StyleKey, name: string): string {
  return `ms-${styleKey}-${name}`;
}

/**
 * The `<symbol>` id of a RUNTIME (saved) symbol in one style. Its own prefix, so
 * a name that is also in the manifest never yields two elements with one id.
 */
export function runtimeSymbolId(styleKey: StyleKey, name: string): string {
  return `msr-${styleKey}-${name}`;
}

/** The sprite `<symbol>` id of a brand mark. */
export function brandId(name: string): string {
  return `si-${name}`;
}

/** The sprite that holds every brand mark (brands have no style). */
export const BRANDS_SPRITE = "brands";
export type SpriteKey = StyleKey | typeof BRANDS_SPRITE;
