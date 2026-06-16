import { Popover, PopoverContent, PopoverTrigger, cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useState, type ReactElement } from "react";
import { IconPicker } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { Row } from "@plugins/primitives/plugins/row/web";

export interface PageIconValue {
  icon: string | null;
  iconSvgNodes: SvgNode[] | null;
}

/**
 * The icon-picker popover, decoupled from its trigger. Picking commits
 * immediately and closes; "Remove" clears the icon back to the default glyph
 * (only offered when an icon is set). The `trigger` is any element — a large
 * page icon or a small "Add icon" affordance — so both entry points share one
 * picker.
 */
export function PageIconPicker({
  value,
  onChange,
  trigger,
}: {
  value: PageIconValue;
  onChange: (next: PageIconValue) => void | Promise<void>;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const hasIcon = value.iconSvgNodes != null && value.iconSvgNodes.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-80 p-sm" align="start">
        <IconPicker
          value={value.icon}
          onSelect={({ key, svgNodes }) => {
            void onChange({ icon: key, iconSvgNodes: svgNodes });
            setOpen(false);
          }}
        />
        {hasIcon && (
          <>
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- vertical breathing room around a 1px divider rule in the popover */}
            <div className="my-1 h-px bg-border" />
            <Row
              size="sm"
              hover="accent"
              onClick={() => {
                void onChange({ icon: null, iconSvgNodes: null });
                setOpen(false);
              }}
              className="text-muted-foreground"
            >
              Remove
            </Row>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The large page header icon: a glyph that opens the icon picker on click.
 * Sized for the header's stacked-over-title treatment.
 */
export function PageIconButton({
  value,
  onChange,
  className,
  style,
}: {
  value: PageIconValue;
  onChange: (next: PageIconValue) => void | Promise<void>;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <PageIconPicker
      value={value}
      onChange={onChange}
      trigger={
        <button
          type="button"
          aria-label="Change page icon"
          style={style}
          className={cn(
            "hover:bg-accent flex size-20 shrink-0 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <PageIcon nodes={value.iconSvgNodes} className="size-[4.5rem]" />
        </button>
      }
    />
  );
}
