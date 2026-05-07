import type { ComponentProps, ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  WithTooltip,
  Kbd,
} from "@plugins/primitives/plugins/tooltip/web";

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
  size = "icon",
  side,
  ...props
}: IconButtonProps) {
  const content = shortcut ? (
    <>
      {tooltip ?? label}
      <Kbd>{shortcut}</Kbd>
    </>
  ) : (
    tooltip ?? label
  );

  return (
    <WithTooltip content={content} side={side}>
      <Button variant={variant} size={size} aria-label={label} {...props}>
        <Icon className="size-4" />
      </Button>
    </WithTooltip>
  );
}
