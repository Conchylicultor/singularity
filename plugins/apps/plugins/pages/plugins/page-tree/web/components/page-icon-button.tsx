import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState, type ReactElement } from "react";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { IconPicker } from "@plugins/primitives/plugins/icon-picker/web";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { symbol, type SavedSymbolName } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const closeIcon = symbol("close");

export interface PageIconValue {
  icon: SavedSymbolName | null;
}

/**
 * The icon-picker popover, decoupled from its trigger. Picking commits
 * immediately and closes; "Remove" clears the icon back to the default glyph
 * (only offered when an icon is set). The `trigger` is any element — a large
 * page icon or a small "Add icon" affordance — so both entry points share one
 * picker.
 *
 * It is a `ControlPanelPopover size="picker"`, so the icon block's label, search
 * field and grid inherit the panel's one content inset, and the rule above the
 * Remove footer is drawn by the container rather than placed here.
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
  const hasIcon = value.icon != null;

  return (
    <ControlPanelPopover
      open={open}
      onOpenChange={setOpen}
      size="picker"
      align="start"
      label="Page icon"
      trigger={trigger}
    >
      {/* No section label: the icon block renders its own header (label + count). */}
      <ControlPanel.Section>
        <IconPicker
          value={value.icon}
          onSelect={(icon) => {
            void onChange({ icon });
            setOpen(false);
          }}
        />
      </ControlPanel.Section>
      {hasIcon && (
        <ControlPanel.Footer>
          <ControlPanel.Row
            muted
            icon={<Icon icon={closeIcon} />}
            onSelect={() => {
              void onChange({ icon: null });
              setOpen(false);
            }}
          >
            Remove
          </ControlPanel.Row>
        </ControlPanel.Footer>
      )}
    </ControlPanelPopover>
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
          // eslint-disable-next-line layout/no-adhoc-layout -- rigid icon trigger in the page header's icon/title stack
          className={cn(
            "hover:bg-accent size-20 shrink-0 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Center className="size-full">
            <PageIcon icon={value.icon} className="size-[4.5rem]" />
          </Center>
        </button>
      }
    />
  );
}
