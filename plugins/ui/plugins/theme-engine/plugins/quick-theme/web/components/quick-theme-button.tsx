import { useState } from "react";
import { MdPalette } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { useActiveApp } from "@plugins/apps-core/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { themeCustomizerRoute } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { QuickThemePanel } from "./quick-theme-panel";

/**
 * Toolbar entry point for theming, surfaced in every app via `ActionBar.Item`
 * (the docked tab-bar strip and the floating bar). It opens the quick-switch
 * popover so a theme change never costs the user their current pane; the full
 * customizer is one click further, behind the panel's footer.
 *
 * Both mount points render OUTSIDE every `<PaneSurfaceProvider>`, so this has no
 * pane store — `useOpenPane()` would throw. Global chrome navigates through the
 * cross-app `navigate()`. The customizer opens in the ACTIVE app (it styles that
 * app's theme scope), so the link is the active app's base path plus the route's
 * own segment.
 */
export function QuickThemeButton() {
  const [open, setOpen] = useState(false);
  const activeApp = useActiveApp();

  const openEditor = () => {
    setOpen(false);
    navigate(`${activeApp?.path ?? ""}${themeCustomizerRoute.path({})}`);
  };

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      side="bottom"
      width="3xl"
      padding="none"
      trigger={
        <IconButton
          icon={MdPalette}
          label="Theme"
          variant={open ? "secondary" : "ghost"}
        />
      }
    >
      <QuickThemePanel onOpenEditor={openEditor} />
    </InlinePopover>
  );
}
