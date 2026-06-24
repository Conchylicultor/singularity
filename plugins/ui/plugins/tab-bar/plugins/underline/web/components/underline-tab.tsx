import type { KeyboardEvent } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { hoverRevealGroup } from "@plugins/primitives/plugins/hover-reveal/web";
import { TabCloseButton } from "@plugins/ui/plugins/tab-bar/web";
import type { TabProps } from "@plugins/ui/plugins/tab-bar/core";

/**
 * The flat (GitHub / Linear) tab. No fill; the active tab carries a primary
 * underline that sits flush on the strip's bottom border. Composes `Line` (the
 * single-line shell + ref forwarding) with `Text` as the direct-child truncation
 * leaf, so the chip needs no ad-hoc flex/min-w-0. The whole chip is the activate
 * target (keyboard-operable); `hoverRevealGroup` drives the trailing close's
 * reveal.
 */
export function UnderlineTab({
  icon: Icon,
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
        "max-w-40 cursor-pointer gap-xs py-2xs pl-xs pr-2xs transition-colors",
        active
          ? "border-b-2 border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="icon-auto" />}
      {!collapsed && <Text variant="label">{label}</Text>}
      {!collapsed && onClose && (
        <TabCloseButton label={label} onClose={onClose} active={active} />
      )}
    </Line>
  );
}
