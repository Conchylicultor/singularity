import { Button, iconSizeFor, useControlSize } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import {
  WithTooltip,
  Kbd,
} from "@plugins/primitives/plugins/tooltip/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";

export interface IconButtonProps
  extends Omit<ComponentProps<typeof Button>, "children" | "size"> {
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
  // An icon button NEVER sizes itself — its square shape is derived from the
  // ambient control density, which the containing row/slot owns (via
  // `ControlSizeProvider` or a slot's `controlSize` config). This makes a single
  // button physically unable to desync from its neighbors.
  const density = useControlSize();
  const resolvedSize = iconSizeFor(density);
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
      <Button variant={variant} size={resolvedSize} aria-label={label} {...props}>
        <Icon />
      </Button>
    </WithTooltip>
  );
}
