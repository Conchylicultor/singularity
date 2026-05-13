import type { ComponentProps } from "react";

import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ContentPositionerProps = Pick<
  ComponentProps<typeof PopoverContent>,
  "align" | "side"
>;

export interface InlinePopoverProps extends ContentPositionerProps {
  /** Trigger element — open/close behavior is merged via base-ui render prop. */
  trigger: React.ReactElement;
  /** Popover panel content. */
  children: React.ReactNode;
  /** Optional tooltip shown on trigger hover. */
  tooltip?: React.ReactNode;
  /** Extra classes forwarded to PopoverContent (width, padding, etc.). */
  contentClassName?: string;
  /** Controlled open state — omit for uncontrolled. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function InlinePopover({
  trigger,
  children,
  tooltip,
  align = "start",
  side = "bottom",
  contentClassName,
  open,
  onOpenChange,
}: InlinePopoverProps) {
  const triggerNode = <PopoverTrigger render={trigger} />;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {tooltip ? <WithTooltip content={tooltip}>{triggerNode}</WithTooltip> : triggerNode}
      <PopoverContent align={align} side={side} className={contentClassName}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
