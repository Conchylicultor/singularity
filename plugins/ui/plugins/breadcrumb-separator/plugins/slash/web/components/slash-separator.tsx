import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Slash separator — the path spelling, for readers who want a trail to look
 * like the path it is (`docs/design/tokens`).
 *
 * It is a glyph rather than an icon, so it is dimmed harder than the chevron:
 * a slash at the same contrast as its neighbours reads as a character of the
 * words on either side, which is the mistake it is here to avoid. The air
 * around it comes from the trail's gap, not from the glyph.
 */
export function SlashSeparator() {
  return (
    <span aria-hidden className={cn(rigidClass(), "text-muted-foreground/40")}>
      /
    </span>
  );
}
