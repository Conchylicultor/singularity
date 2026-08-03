import { useState, type ReactElement } from "react";

import {
  InlinePopover,
  type InlinePopoverProps,
} from "@plugins/primitives/plugins/popover/web";
import { DatePickerPanel, type DatePickerPanelProps } from "./date-picker-panel";

export interface DatePickerPopoverProps extends DatePickerPanelProps {
  /** Trigger element — open/close is merged in by the popover primitive. */
  trigger: ReactElement;
  /** Controlled open state; omit for uncontrolled. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Close the popover once the value is committed. Defaults to `true`, and is
   * ignored when `withTime` is set — a date-time picker has a second field to
   * fill in, so closing on the day press would make the time unreachable.
   */
  closeOnSelect?: boolean;
  /** Positioning + chrome, forwarded verbatim to `InlinePopover`. */
  align?: InlinePopoverProps["align"];
  side?: InlinePopoverProps["side"];
  width?: InlinePopoverProps["width"];
  padding?: InlinePopoverProps["padding"];
  tooltip?: InlinePopoverProps["tooltip"];
}

/**
 * `DatePickerPanel` behind a trigger.
 *
 * Open state is always resolved here (falling back to internal state when the
 * consumer doesn't control it) rather than handed to `InlinePopover`
 * uncontrolled: closing on commit has to drive the popover from inside its own
 * content, which an uncontrolled popover offers no handle for.
 */
export function DatePickerPopover({
  trigger,
  open,
  onOpenChange,
  closeOnSelect = true,
  align,
  side,
  width,
  padding,
  tooltip,
  onChange,
  onClear,
  ...panelProps
}: DatePickerPopoverProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = open ?? ownOpen;
  const dismissOnCommit = closeOnSelect && panelProps.withTime !== true;

  function setOpen(next: boolean) {
    if (!isControlled) setOwnOpen(next);
    onOpenChange?.(next);
  }

  return (
    <InlinePopover
      trigger={trigger}
      open={isOpen}
      onOpenChange={setOpen}
      align={align}
      side={side}
      width={width}
      padding={padding}
      tooltip={tooltip}
    >
      <DatePickerPanel
        {...panelProps}
        onChange={(next) => {
          onChange(next);
          if (dismissOnCommit) setOpen(false);
        }}
        onClear={
          onClear === undefined
            ? undefined
            : () => {
                onClear();
                if (dismissOnCommit) setOpen(false);
              }
        }
      />
    </InlinePopover>
  );
}
