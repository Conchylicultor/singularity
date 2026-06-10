import { useState } from "react";
import { IconPicker } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface PageIconValue {
  icon: string | null;
  iconSvgNodes: SvgNode[] | null;
}

/**
 * The page header's icon: a glyph that opens an icon picker on click. Unlike
 * `AvatarPicker` there is no color disc — a Notion page icon is a bare icon.
 * Picking commits immediately and closes the popover; "Remove" clears it back
 * to the default glyph.
 */
export function PageIconButton({
  value,
  onChange,
}: {
  value: PageIconValue;
  onChange: (next: PageIconValue) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const hasIcon = value.iconSvgNodes != null && value.iconSvgNodes.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="text-muted-foreground hover:bg-accent flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Pick page icon"
      >
        <PageIcon nodes={value.iconSvgNodes} className="size-6" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <IconPicker
          value={value.icon}
          onSelect={({ key, svgNodes }) => {
            void onChange({ icon: key, iconSvgNodes: svgNodes });
            setOpen(false);
          }}
        />
        {hasIcon && (
          <>
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
