import { Icon } from "@plugins/ui/plugins/icons/web";
import {
  runtimeSymbol,
  symbol,
  type IconRef,
  type SavedSymbolName,
} from "@plugins/ui/plugins/icons/core";

const descriptionIcon = symbol("description");

export interface PageIconProps {
  /** The page's saved icon (a Material Symbols name), or null/undefined for none. */
  icon: SavedSymbolName | null | undefined;
  /** Glyph shown when the page has no icon. Defaults to a document icon. */
  fallback?: IconRef;
  /** Tailwind size class, applied to both the icon and the fallback. */
  className?: string;
}

/**
 * The single renderer for a page's icon across every surface — header, sidebar,
 * page links, backlinks, and the page picker — so they all stay identical.
 * Draws the saved name as a runtime symbol (in the theme scope's icon style)
 * when present, else a fallback glyph.
 */
export function PageIcon({
  icon,
  fallback = descriptionIcon,
  className = "size-4",
}: PageIconProps) {
  return (
    <Icon
      icon={icon != null ? runtimeSymbol(icon) : fallback}
      className={className}
    />
  );
}
