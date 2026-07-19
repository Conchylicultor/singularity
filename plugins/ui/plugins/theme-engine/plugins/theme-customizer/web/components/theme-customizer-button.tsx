import { MdPalette } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { usePathname } from "@plugins/primitives/plugins/pane/web";
import { useActiveApp } from "@plugins/apps-core/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { themeCustomizerRoute } from "../panes";

/**
 * Toolbar entry point for the theme customizer, surfaced in every app via
 * `ActionBar.Item` (the docked tab-bar strip and the floating bar).
 *
 * Both of those mount points render OUTSIDE every `<PaneSurfaceProvider>`, so
 * this component has no pane store — `useOpenPane()`/`useToggle()` would throw.
 * (They used to silently resolve to the orphaned module-level `defaultStore`,
 * which wrote a URL nobody rendered: the click changed the address bar and
 * nothing else.) Global chrome navigates through the cross-app `navigate()`
 * and derives its own state from the URL via `usePathname()`.
 *
 * The customizer opens in the ACTIVE app (it styles that app's theme scope),
 * so the link is the active app's base path plus the route's own segment.
 */
export function ThemeCustomizerButton() {
  const pathname = usePathname();
  const activeApp = useActiveApp();

  const appPath = activeApp?.path ?? "";
  const customizerPath = `${appPath}${themeCustomizerRoute.path({})}`;
  const isOpen = pathname === customizerPath;

  const handleClick = () => {
    if (isOpen) {
      const path = activeApp?.path ?? "/";
      if (window.location.pathname !== path) {
        navigate(path);
      }
    } else {
      navigate(customizerPath);
    }
  };

  return (
    <IconButton
      icon={MdPalette}
      label="Theme"
      variant={isOpen ? "secondary" : "ghost"}
      aria-pressed={isOpen}
      onClick={handleClick}
    />
  );
}
