import {
  ALL_STYLE_KEYS,
  ICON_SHAPES,
  iconifyName,
  parseStyleKey,
  type IconWeight,
  type StyleKey,
} from "./style";

/**
 * Not every Material Symbols name is drawn in all 12 styles: `insights` has no
 * outline, `auto-fix-high` exists only filled at weight 400. A style that
 * lacks the name draws the NEAREST style that has it, so every name renders in
 * every theme. This is that one rule, as data; the sprite builder applies it,
 * so the sprite for style K holds, under `ms-K-<name>`, the resolved drawing
 * and `<Icon>` never has to know.
 */

/** The styles `name` is drawn in, given a lookup of which Iconify names each weight's set holds. */
export function coveredStyles(
  name: string,
  has: (weight: IconWeight, iconifyName: string) => boolean,
): StyleKey[] {
  return ALL_STYLE_KEYS.filter((key) => {
    const { shape, fill, weight } = parseStyleKey(key);
    return has(weight, iconifyName(name, shape, fill));
  });
}

/**
 * The style that draws a name requested in `requested`, among `covered` (the
 * styles the name exists in). Nearest first, by axis priority:
 *
 * 1. **fill** — it carries the active state, so it is kept whenever the name
 *    has it at all; a filled-only icon (`insights`) draws filled at rest.
 * 2. **weight** (regular / light).
 * 3. **shape** — the requested one, else `default`, else in `ICON_SHAPES`
 *    order.
 *
 * Throws on an empty `covered`: such a name is not a `SymbolName`.
 */
export function resolveSymbolStyle(
  covered: readonly StyleKey[],
  requested: StyleKey,
): StyleKey {
  if (covered.length === 0) {
    throw new Error(
      `[icons] no style draws this symbol (requested ${requested})`,
    );
  }
  const want = parseStyleKey(requested);
  const rank = (key: StyleKey): number[] => {
    const c = parseStyleKey(key);
    return [
      c.fill === want.fill ? 0 : 1,
      c.weight === want.weight ? 0 : 1,
      c.shape === want.shape ? 0 : 1,
      c.shape === "default" ? 0 : 1,
      ICON_SHAPES.indexOf(c.shape),
    ];
  };
  const before = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i]! < b[i]!;
    }
    return false;
  };
  let best = covered[0]!;
  let bestRank = rank(best);
  for (const key of covered.slice(1)) {
    const r = rank(key);
    if (before(r, bestRank)) {
      best = key;
      bestRank = r;
    }
  }
  return best;
}
