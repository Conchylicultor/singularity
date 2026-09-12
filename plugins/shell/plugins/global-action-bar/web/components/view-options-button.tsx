import { useState } from "react";
import { MdPushPin, MdSettings } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";

/**
 * The bar's single gear button. Options about how the app is SHOWN (surface
 * mode, browser fullscreen, layout editing, and whether this bar is pinned) are
 * set once and left alone, so they share one popover instead of each taking a
 * button in the bar.
 *
 * The contributed rows come from `ActionBar.ViewOption`; the pin row is this
 * bar's own preference, so it is rendered here rather than contributed.
 */
export function ViewOptionsButton({
  pinned,
  onTogglePin,
}: {
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <ControlPanelPopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      side="bottom"
      label="View options"
      trigger={
        <IconButton
          icon={MdSettings}
          label="View options"
          variant={open ? "secondary" : "ghost"}
        />
      }
    >
      <ActionBar.ViewOption.Render />
      <ControlPanel.Row
        icon={<MdPushPin />}
        select="switch"
        checked={pinned}
        onSelect={onTogglePin}
      >
        Pin action bar
      </ControlPanel.Row>
    </ControlPanelPopover>
  );
}
