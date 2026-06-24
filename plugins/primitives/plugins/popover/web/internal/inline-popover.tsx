import { Popover, PopoverContent, PopoverTrigger } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { PopoverWidth, PopoverPadding } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentProps } from "react";

import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";

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
  /** Closed width role forwarded to PopoverContent; default size-to-content. */
  width?: PopoverWidth;
  /** Padding role forwarded to PopoverContent; default `md`. */
  padding?: PopoverPadding;
  /**
   * Extra classes forwarded to PopoverContent. Must NOT carry width or padding —
   * use the `width` / `padding` props instead.
   */
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
  width,
  padding,
  contentClassName,
  open,
  onOpenChange,
}: InlinePopoverProps) {
  const triggerNode = <PopoverTrigger render={trigger} />;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {tooltip ? <WithTooltip content={tooltip}>{triggerNode}</WithTooltip> : triggerNode}
      <PopoverContent align={align} side={side} width={width} padding={padding} className={contentClassName}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
