import type { KeyboardEvent } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { hoverRevealGroup } from "@plugins/primitives/plugins/hover-reveal/web";
import { TabCloseButton } from "@plugins/ui/plugins/tab-bar/web";
import type { TabProps } from "@plugins/ui/plugins/tab-bar/core";

/**
 * The skeuomorphic folder tab. The strip declares `fillHeight` (see the variant
 * contribution), so every tab fills the strip's full height and the strip drops
 * its bottom padding + `border-b`. The active tab is then a bordered,
 * background-filled folder whose open bottom edge sits flush on the strip's
 * bottom edge — i.e. directly on the content seam — so it reads as one
 * continuous surface with the content panel below (the Chrome model: a
 * content-colored notch in the recessed strip, no 1px-overlap trickery needed).
 * Inactive tabs stay flat and muted. Composes `Line` (the single-line shell +
 * ref forwarding) with `Text` as the direct-child truncation leaf, so the chip
 * needs no ad-hoc flex/min-w-0. The whole chip is the activate target
 * (keyboard-operable); `hoverRevealGroup` drives the trailing close's reveal.
 */
export function ConnectedTab({
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
        // h-full: fill the strip's full height so the active folder's bottom
        // edge lands on the content seam (the strip is fillHeight — no centering
        // moat below the tab).
        // select-none: a tab is a button, not document text — mirror a native
        // <button> (which this `role="button"` div otherwise loses) so a
        // press-and-drag (e.g. dragging a floating-window tab) never starts a
        // text selection of the label.
        "h-full max-w-40 cursor-pointer select-none gap-xs py-2xs pl-xs pr-2xs transition-colors",
        active
          ? "rounded-t-md border border-b-0 bg-background text-foreground"
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
