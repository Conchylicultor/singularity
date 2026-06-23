import {
  Button,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import {
  WithTooltip,
  Kbd,
} from "@plugins/primitives/plugins/tooltip/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";

export interface IconButtonProps
  extends Omit<ComponentProps<typeof Button>, "children" | "size">,
    DensityControlled {
  icon: ComponentType<{ className?: string }>;
  label: string;
  tooltip?: ReactNode;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
}

export function IconButton({
  icon: Icon,
  label,
  tooltip,
  shortcut,
  variant = "ghost",
  side,
  ...props
}: IconButtonProps) {
  // An icon button NEVER sizes itself — `aspect="icon"` makes Button derive its
  // square box from the ambient control density, which the containing row/slot
  // owns (via `ControlSizeProvider` or a slot's `controlSize` config). This makes
  // a single button physically unable to desync from its neighbors.
  const content = shortcut ? (
    <>
      {tooltip ?? label}
      <Kbd>{formatShortcutLabel(shortcut)}</Kbd>
    </>
  ) : (
    tooltip ?? label
  );

  return (
    <WithTooltip content={content} side={side}>
      <Button variant={variant} aspect="icon" aria-label={label} {...props}>
        <Icon />
      </Button>
    </WithTooltip>
  );
}
