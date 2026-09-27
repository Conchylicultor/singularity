import type { BrandName, SymbolName } from "./symbol-names.generated";

/** A Material Symbols icon. Its style (shape, fill, weight) is the theme's, not the call site's. */
export interface SymbolRef {
  readonly kind: "symbol";
  readonly name: SymbolName;
}

/** A brand mark (Simple Icons). Brands ignore the icon theme and always draw their own mark. */
export interface BrandRef {
  readonly kind: "brand";
  readonly name: BrandName;
}

/**
 * An icon as DATA: which glyph, never how it looks. `<Icon icon={…}/>` draws it
 * in the style the surrounding theme scope picks, so a slot takes an `IconRef`
 * rather than a component.
 */
export type IconRef = SymbolRef | BrandRef;

/**
 * A Material Symbols icon by its base name (`"forum"`, `"open-in-new"`). The
 * argument must be a string literal (lint `icons/literal-icon-name`): the build
 * collects every literal into the icon manifest, and only manifest names ship in
 * the sprites. An unknown name is a tsc error.
 */
export function symbol(name: SymbolName): SymbolRef {
  return { kind: "symbol", name };
}

/** A brand mark by its Simple Icons slug (`"github"`, `"notion"`). String literal only, like {@link symbol}. */
export function brand(name: BrandName): BrandRef {
  return { kind: "brand", name };
}
