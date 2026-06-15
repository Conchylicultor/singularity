import {
  CHROME_THEME_SCOPE,
  appThemeScope,
} from "@plugins/primitives/plugins/ui-kit/web";
import { useTabs } from "./use-tabs";

/**
 * The `data-theme-scope` token the chrome surfaces (app rail + tab bar) should
 * wear.
 *
 * By default the chrome wears the global base theme ({@link CHROME_THEME_SCOPE})
 * so it stays a neutral frame. But when the focused tab is **docked**, exactly
 * one app fills the surface full-bleed and the chrome frames that single app —
 * so the rail + tab bar adopt that app's own theme (`app:<id>`), reading as one
 * continuous surface with the app rather than a separate chrome shell.
 *
 * In desktop (a tab is floating) or solo placement the chrome stays neutral:
 * floating windows of different apps share one backdrop, so no single app owns
 * the chrome; solo hides the chrome entirely. The focused app's
 * `ScopedAppTheme` block is always present (its tab is open), so the scope
 * switch never references a missing style block.
 */
export function useChromeThemeScope(): string {
  const { tabs, focusedTabId } = useTabs();
  const focused = tabs.find((t) => t.tabId === focusedTabId);
  return focused?.placement === "docked"
    ? appThemeScope(focused.appId)
    : CHROME_THEME_SCOPE;
}
