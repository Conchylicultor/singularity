import { MdPalette } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { openPane } from "@plugins/primitives/plugins/pane/web";
import { useActiveApp } from "@plugins/apps/web";
import { themeCustomizerPane } from "../panes";

/**
 * Toolbar entry point for the theme customizer, surfaced in every app via
 * `ActionBar.Item` (the agent-manager toolbar and the floating bar). Opens the
 * customizer as a root pane (matching the prior sidebar behavior); closing
 * navigates back to the active app's default view, which clears the pane chain
 * — the same navigation the app rail performs. This works uniformly across
 * pane-hosting apps and Sonata's overlay host alike.
 */
export function ThemeCustomizerButton() {
  // `useToggle` reads the chain store directly, so `isOpen` is correct even
  // though this button renders outside any pane (no PaneMatchContext).
  const { isOpen } = themeCustomizerPane.useToggle({}, { mode: "root" });
  const activeApp = useActiveApp();

  const handleClick = () => {
    if (isOpen) {
      const path = activeApp?.path ?? "/";
      if (window.location.pathname !== path) {
        window.history.pushState({}, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    } else {
      openPane(themeCustomizerPane, {}, { mode: "root" });
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
