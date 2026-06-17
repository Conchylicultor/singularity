import { Button, iconSizeFor, useControlSize } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import {
  WithTooltip,
  Kbd,
} from "@plugins/primitives/plugins/tooltip/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";

export interface IconButtonProps
  extends Omit<ComponentProps<typeof Button>, "children"> {
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
  size,
  side,
  ...props
}: IconButtonProps) {
  // No explicit `size` → inherit the ambient density as the square icon shape.
  const density = useControlSize();
  const resolvedSize = size ?? iconSizeFor(density);
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
