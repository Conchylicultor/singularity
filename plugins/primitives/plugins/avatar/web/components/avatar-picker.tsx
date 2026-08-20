import { MdClose } from "react-icons/md";
import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState, type ReactNode } from "react";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { IconPicker } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import {
  AVATAR_COLOR_KEYS,
  AVATAR_COLORS,
  type AvatarColor,
} from "../internal/colors";

export interface AvatarSpec {
  icon: string | null;
  color: string | null;
  svgNodes: SvgNode[] | null;
}

export interface AvatarPickerProps {
  value: AvatarSpec;
  onChange: (next: AvatarSpec) => void | Promise<void>;
  children: ReactNode;
  triggerClassName?: ClassName;
  triggerLabel?: string;
}

/**
 * Colour swatches over the icon grid, with a Clear footer once either is set.
 *
 * It is a `ControlPanelPopover size="picker"` rather than a hand-rolled popover:
 * the swatch cluster, the icon block's own label / search / grid, and the Clear
 * row all land on one left edge because the panel owns the content inset, and
 * the rule between the colour band, the icon band and the footer is drawn by the
 * container — there is no hairline here to place, forget or double.
 */
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
    <ControlPanelPopover
      open={open}
      onOpenChange={setOpen}
      size="picker"
      align="start"
      label={triggerLabel ?? "Pick avatar"}
      trigger={
        <button
          type="button"
          aria-label={triggerLabel ?? "Pick avatar"}
          className={cn(
            "rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
            triggerClassName,
          )}
        >
          {children}
        </button>
      }
    >
      <ControlPanel.Section label="Color">
        <Cluster gap="xs">
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
                value.color === key &&
                  "scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background",
              )}
            />
          ))}
        </Cluster>
      </ControlPanel.Section>

      {/* No section label: the icon block renders its own header (label + count). */}
      <ControlPanel.Section>
        <IconPicker
          value={value.icon}
          onSelect={({ key, svgNodes }) =>
            void onChange({ ...value, icon: key, svgNodes })
          }
        />
      </ControlPanel.Section>

      {(value.icon || value.color) && (
        <ControlPanel.Footer>
          <ControlPanel.Row
            muted
            icon={<MdClose />}
            onSelect={() =>
              void onChange({ icon: null, color: null, svgNodes: null })
            }
          >
            Clear
          </ControlPanel.Row>
        </ControlPanel.Footer>
      )}
    </ControlPanelPopover>
  );
}
