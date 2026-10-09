import type { CalloutColor } from "../../core";

/**
 * The callout's semantic tint, painted by the container FRAME (it spans the
 * callout's own line and everything nested inside it), and the matching icon
 * color used by the block's leading glyph. Both are theme tokens — never raw
 * colors — so a preset switch restyles them for free.
 */
export const COLOR_BG: Record<CalloutColor, string> = {
  default: "bg-muted",
  info: "bg-info/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
  danger: "bg-destructive/15",
};

/** Icon color per semantic color (theme tokens). */
export const COLOR_TEXT: Record<CalloutColor, string> = {
  default: "text-muted-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};
