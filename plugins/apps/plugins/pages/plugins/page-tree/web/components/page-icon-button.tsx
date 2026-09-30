import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState, type ReactElement, type ReactNode } from "react";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { EmojiPicker } from "@plugins/ui/plugins/icons/plugins/emoji/web";
import type { Emoji } from "@plugins/ui/plugins/icons/plugins/emoji/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const closeIcon = symbol("close");

export interface PageIconValue {
  icon: Emoji | null;
}

/**
 * Extra rows for the picker's footer, rendered above "Remove" — the extension
 * point for an action that belongs beside Remove (a "Regenerate" from the
 * page's auto-icon). Handed `close` so a row can dismiss the picker once it
 * has acted. Each row is a `ControlPanel.Row`.
 */
export type PageIconFooterActions = (ctx: { close: () => void }) => ReactNode;

/**
 * The emoji-picker popover, decoupled from its trigger. Picking commits
 * immediately and closes; "Remove" clears the icon back to the default glyph
 * (only offered when an icon is set); `footerActions` adds rows above it. The `trigger` is any element — a large
 * page icon or a small "Add icon" affordance — so both entry points share one
 * picker.
 *
 * It is a `ControlPanelPopover size="picker"`, so the emoji block's label,
 * search field and grid inherit the panel's one content inset, and the rule
 * above the footer is drawn by the container rather than placed here.
 */
export function PageIconPicker({
  value,
  onChange,
  trigger,
  footerActions,
}: {
  value: PageIconValue;
  onChange: (next: PageIconValue) => void | Promise<void>;
  trigger: ReactElement;
  footerActions?: PageIconFooterActions;
}) {
  const [open, setOpen] = useState(false);
  const hasIcon = value.icon != null;
  const close = () => setOpen(false);

  return (
    <ControlPanelPopover
      open={open}
      onOpenChange={setOpen}
      size="picker"
      align="start"
      label="Page icon"
      trigger={trigger}
    >
      {/* No section label: the emoji block renders its own header. */}
      <ControlPanel.Section>
        <EmojiPicker
          value={value.icon}
          onSelect={(icon) => {
            void onChange({ icon });
            close();
          }}
        />
      </ControlPanel.Section>
      {(hasIcon || footerActions) && (
        <ControlPanel.Footer>
          {footerActions?.({ close })}
          {hasIcon && (
            <ControlPanel.Row
              muted
              icon={<Icon icon={closeIcon} />}
              onSelect={() => {
                void onChange({ icon: null });
                close();
              }}
            >
              Remove
            </ControlPanel.Row>
          )}
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
  footerActions,
  className,
  style,
}: {
  value: PageIconValue;
  onChange: (next: PageIconValue) => void | Promise<void>;
  footerActions?: PageIconFooterActions;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <PageIconPicker
      value={value}
      onChange={onChange}
      footerActions={footerActions}
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
