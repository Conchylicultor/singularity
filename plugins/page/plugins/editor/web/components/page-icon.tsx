import { Icon } from "@plugins/ui/plugins/icons/web";
import { symbol, type IconRef } from "@plugins/ui/plugins/icons/core";
import type { Emoji } from "@plugins/ui/plugins/icons/plugins/emoji/core";
import { EmojiGlyph } from "@plugins/ui/plugins/icons/plugins/emoji/web";

const descriptionIcon = symbol("description");

export interface PageIconProps {
  /** The page's emoji icon, or null/undefined for none. */
  icon: Emoji | null | undefined;
  /** Glyph shown when the page has no icon. Defaults to a document icon. */
  fallback?: IconRef;
  /** Tailwind size class, applied to both the emoji and the fallback. */
  className?: string;
}

/**
 * The single renderer for a page's icon across every surface — header, sidebar,
 * page links, backlinks, and the page picker — so they all stay identical.
 * Draws the emoji as a glyph filling the same box the fallback symbol would
 * (`EmojiGlyph`, sized by the same `className`), else the fallback glyph.
 */
export function PageIcon({
  icon,
  fallback = descriptionIcon,
  className = "size-4",
}: PageIconProps) {
  return icon == null ? (
    <Icon icon={fallback} className={className} />
  ) : (
    <EmojiGlyph emoji={icon} className={className} />
  );
}
