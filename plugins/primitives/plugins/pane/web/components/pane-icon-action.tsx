import { Button, iconSizeFor, useControlSize } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { forwardRef, type ComponentType, type ReactNode } from "react";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";

interface PaneIconActionProps {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  children?: ReactNode;
}

export const PaneIconAction = forwardRef<
  HTMLButtonElement,
  PaneIconActionProps
>(function PaneIconAction({ label, icon: Icon, onClick, children }, ref) {
  // Hoisted (rules-of-hooks): bare Button defaults to the TEXT shape, so force the
  // square icon shape at the ambient density so custom-children actions match the
  // icon buttons beside them.
  const iconSize = iconSizeFor(useControlSize());
  if (children && !Icon) {
    return (
      <WithTooltip content={label}>
        <Button
          ref={ref}
          variant="ghost"
          size={iconSize}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </WithTooltip>
    );
  }
  return <IconButton ref={ref} icon={Icon!} label={label} onClick={onClick} />;
});
