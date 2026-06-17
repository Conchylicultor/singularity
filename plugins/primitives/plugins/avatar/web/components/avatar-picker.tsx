import { cn, Popover, PopoverContent, PopoverTrigger } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState, type ReactNode } from "react";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { IconPicker } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { AVATAR_COLOR_KEYS, AVATAR_COLORS, type AvatarColor } from "../internal/colors";

export interface AvatarSpec {
  icon: string | null;
  color: string | null;
  svgNodes: SvgNode[] | null;
}

export interface AvatarPickerProps {
  value: AvatarSpec;
  onChange: (next: AvatarSpec) => void | Promise<void>;
  children: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
}

export function AvatarPicker({
  value,
  onChange,
  children,
  triggerClassName,
  triggerLabel,
}: AvatarPickerProps) {
  const [open, setOpen] = useState(false);

  const pickColor = (color: AvatarColor) => void onChange({ ...value, color });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn("rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", triggerClassName)}
        aria-label={triggerLabel ?? "Pick avatar"}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-sm" align="start">

        {/* Color row */}
        <SectionLabel className="px-xs pt-xs pb-xs text-3xs">
          Color
        </SectionLabel>
        <div className="flex flex-wrap gap-xs px-xs pb-sm">
          {AVATAR_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={value.color === key}
              onClick={() => pickColor(key)}
              className={cn(
                "size-5 rounded-full border border-border transition-transform",
                AVATAR_COLORS[key],
                value.color === key && "scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background",
              )}
            />
          ))}
        </div>

        {/* Icon picker */}
        <IconPicker
          value={value.icon}
          onSelect={({ key, svgNodes }) => void onChange({ ...value, icon: key, svgNodes })}
        />

        {/* Clear */}
        {(value.icon || value.color) && (
          <>
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off vertical offset on a hairline divider */}
            <div className="my-1 h-px bg-border" />
            <Row
              size="sm"
              hover="accent"
              onClick={() => void onChange({ icon: null, color: null, svgNodes: null })}
              className="text-muted-foreground"
            >
              Clear
            </Row>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
