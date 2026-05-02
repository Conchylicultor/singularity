import { useState, type ReactNode } from "react";
import { MdCheck } from "react-icons/md";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AVATAR_COLOR_KEYS, AVATAR_COLORS, type AvatarColor } from "../internal/colors";
import { AVATAR_ICONS, AVATAR_ICON_KEYS } from "../internal/icons";

export interface AvatarSpec {
  icon: string | null;
  color: string | null;
}

export interface AvatarPickerProps {
  value: AvatarSpec;
  onChange: (next: AvatarSpec) => void | Promise<void>;
  /** The trigger element (typically an <Avatar/>) that opens the popover. */
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

  const pickIcon = (icon: string) => {
    void onChange({ ...value, icon });
  };
  const pickColor = (color: AvatarColor) => {
    void onChange({ ...value, color });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn("rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", triggerClassName)}
        aria-label={triggerLabel ?? "Pick avatar"}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="px-1 pt-1 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Color
        </div>
        <div className="flex flex-wrap gap-1.5 px-1 pb-2">
          {AVATAR_COLOR_KEYS.map((key) => {
            const selected = value.color === key;
            return (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={selected}
                onClick={() => pickColor(key)}
                className={cn(
                  "size-5 rounded-full border border-border transition-transform",
                  AVATAR_COLORS[key],
                  selected && "scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background",
                )}
              />
            );
          })}
        </div>
        <div className="px-1 pt-1 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Icon
        </div>
        <div className="grid grid-cols-8 gap-1 px-1 pb-1">
          {AVATAR_ICON_KEYS.map((key) => {
            const Icon = AVATAR_ICONS[key]!;
            const selected = value.icon === key;
            return (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={selected}
                title={key}
                onClick={() => pickIcon(key)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-foreground/80 hover:bg-accent",
                  selected && "bg-accent text-foreground ring-1 ring-ring",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
        {(value.icon || value.color) && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => onChange({ icon: null, color: null })}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
            >
              <MdCheck className="size-3 opacity-0" />
              Clear
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
