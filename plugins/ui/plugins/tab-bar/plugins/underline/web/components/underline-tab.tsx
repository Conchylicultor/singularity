import type { KeyboardEvent } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { hoverRevealGroup } from "@plugins/primitives/plugins/hover-reveal/web";
import { TabCloseButton, TabIcon } from "@plugins/ui/plugins/tab-bar/web";
import type { TabProps } from "@plugins/ui/plugins/tab-bar/core";

/**
 * The flat (GitHub / Linear) tab. No fill; the active tab carries an underline
 * in the text colour that sits flush on the strip's bottom border (the variant
 * declares a `flush` strip, so the tab fills the strip's height and its bottom
 * edge IS that border). Hovering an inactive tab previews the underline in the
 * hairline colour. The underline is in the text colour, not the accent: the
 * tab strip is chrome, and the only accent on screen belongs to the app.
 * Composes `Line` (the
 * single-line shell + ref forwarding) with `Text` as the direct-child truncation
 * leaf, so the chip needs no ad-hoc flex/min-w-0. The whole chip is the activate
 * target (keyboard-operable); `hoverRevealGroup` drives the trailing close's
 * reveal.
 */
export function UnderlineTab({
  icon: Icon,
  badge,
  label,
  active,
  collapsed,
  onActivate,
  onClose,
  className,
  ...rest
}: TabProps) {
  return (
    <Line
      as="div"
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onActivate}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate?.();
        }
      }}
      className={cn(
        hoverRevealGroup,
        // A tab is a button, not document text: `select-none` mirrors a native
        // <button> (which this `role="button"` div otherwise loses), so a
        // press-and-drag — e.g. dragging a floating-window tab — never starts a
        // text selection of the label.
        // A transparent 2px band top AND bottom keeps the label centred; the
        // bottom one is the underline.
        "h-full max-w-48 select-none gap-xs border-y-2 border-transparent pl-sm pr-2xs transition-colors",
        active
          ? "border-b-foreground text-foreground"
          : "text-muted-foreground hover:border-b-border hover:text-foreground",
        className,
      )}
      {...rest}
    >
      <TabIcon icon={Icon} badge={badge} />
      {!collapsed && <Text variant="label">{label}</Text>}
      {!collapsed && onClose && (
        <TabCloseButton label={label} onClose={onClose} active={active} />
      )}
    </Line>
  );
}
