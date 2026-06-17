import { cn, Popover, PopoverContent, PopoverTrigger } from "@plugins/primitives/plugins/ui-kit/web";
import { useState, type ReactNode } from "react";
import { ColorPicker, type ColorPickerProps } from "./color-picker";

export interface ColorPickerPopoverProps extends ColorPickerProps {
  children?: ReactNode;
  contentClassName?: string;
}

export function ColorPickerPopover({
  children,
  contentClassName,
  ...pickerProps
}: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);

  const trigger = children ?? (
    <button
      type="button"
      aria-label="Pick color"
      className={cn(
        "size-6 rounded-md border border-border outline-none transition-transform",
        "focus-visible:ring-2 focus-visible:ring-ring",
      )}
      style={{ background: pickerProps.value }}
    />
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-auto p-none", contentClassName)}
        align="start"
      >
        <ColorPicker {...pickerProps} />
      </PopoverContent>
    </Popover>
  );
}
