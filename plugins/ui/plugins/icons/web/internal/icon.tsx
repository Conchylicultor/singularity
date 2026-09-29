import type { ComponentPropsWithRef } from "react";
import {
  DEFAULT_ICON_STYLE,
  brandId,
  runtimeSymbolId,
  styleKeyOf,
  symbolId,
  type IconRef,
  type IconStyle,
} from "../../core";
import { useIconScope } from "./icon-scope";
import { useScopeIconStyle } from "./style-store";
import { useSpriteLoaded } from "./sprite-store";
import { useRuntimeSymbolKey } from "./runtime-symbol-store";

export interface IconProps extends Omit<
  ComponentPropsWithRef<"svg">,
  "children"
> {
  icon: IconRef;
  /**
   * Draw the icon in its active form — the theme's `iconActiveFill` (filled by
   * default): a selected nav item, a pinned row, an on toggle.
   */
  active?: boolean;
  /** An accessible name, drawn as the svg's `<title>`; the icon is then no longer hidden from assistive tech. */
  title?: string;
}

/** The icon style of the theme scope this component renders in. */
export function useIconStyle(): IconStyle {
  return useScopeIconStyle(useIconScope());
}

/**
 * Draws an `IconRef`: an `<svg>` at 1em (so `className="size-4"` and every
 * `[&_svg]:…` rule size it as before) that `<use>`s the sprite symbol for the
 * icon in its theme scope's style.
 *
 * Until that style's sprite has loaded it draws the DEFAULT style's symbol —
 * the same glyph in the global style, in the same box, which is resident from
 * first paint. Brands have one mark and ignore the style.
 *
 * A runtime (saved) symbol draws from the runtime symbol store the same way:
 * its style's symbol once held, the default style's while that one loads, and
 * — only for a name no chunk holds in either — an empty box at its final size
 * (a loading state) until the fetch lands.
 */
export function Icon({ icon, active = false, title, ...rest }: IconProps) {
  const style = useIconStyle();
  const key = styleKeyOf(style, active);
  const defaultKey = styleKeyOf(DEFAULT_ICON_STYLE, active);
  const loaded = useSpriteLoaded(key);
  const runtimeKey = useRuntimeSymbolKey(
    icon.kind === "runtime-symbol" ? icon.name : null,
    key,
    defaultKey,
  );
  const id =
    icon.kind === "brand"
      ? brandId(icon.name)
      : icon.kind === "runtime-symbol"
        ? runtimeKey === null
          ? null
          : runtimeSymbolId(runtimeKey, icon.name)
        : symbolId(loaded ? key : defaultKey, icon.name);
  const named =
    title !== undefined ||
    rest["aria-label"] !== undefined ||
    rest["aria-labelledby"] !== undefined;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden={named ? undefined : true}
      role={named ? "img" : undefined}
      data-icon={icon.name}
      {...rest}
    >
      {title !== undefined ? <title>{title}</title> : null}
      {id !== null ? <use href={`#${id}`} /> : null}
    </svg>
  );
}
