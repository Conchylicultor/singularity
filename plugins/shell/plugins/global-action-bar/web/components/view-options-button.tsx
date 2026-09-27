import { useState } from "react";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { useActionBarPin } from "../internal/use-action-bar-pin";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const keepIcon = symbol("keep");
const settingsIcon = symbol("settings");

/**
 * The bar's single gear button. Options about how the app is SHOWN (surface
 * mode, browser fullscreen, layout editing, and whether this bar is pinned) are
 * set once and left alone, so they share one popover instead of each taking a
 * button in the bar.
 *
 * The contributed rows come from `ActionBar.ViewOption`; the pin row is this
 * bar's own preference, so it is rendered here rather than contributed.
 *
 * The button itself is an ordinary `ActionBar.Item` (contributed by this
 * plugin), so where it sits in the bar is the slot's order, like every other
 * action — not a fixed "always last".
 */
export function ViewOptionsButton() {
  const [open, setOpen] = useState(false);
  const { pinned, togglePin } = useActionBarPin();

  return (
    <ControlPanelPopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      side="bottom"
      label="View options"
      trigger={
        <IconButton
          icon={settingsIcon}
          label="View options"
          variant={open ? "secondary" : "ghost"}
        />
      }
    >
      <ActionBar.ViewOption.Render />
      <ControlPanel.Row
        icon={<Icon icon={keepIcon} />}
        select="switch"
        checked={pinned}
        onSelect={togglePin}
      >
        Pin action bar
      </ControlPanel.Row>
    </ControlPanelPopover>
  );
}
