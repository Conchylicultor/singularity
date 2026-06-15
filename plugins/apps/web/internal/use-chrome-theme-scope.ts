import {
  CHROME_THEME_SCOPE,
  appThemeScope,
} from "@plugins/primitives/plugins/ui-kit/web";
import { useActiveApp } from "./use-active-app";
import { useFocusedPlacement } from "./use-tabs";
import { placementHasAppThemeScope } from "./placement-registry";

/**
 * The `data-theme-scope` token the cross-app chrome surfaces (app rail, tab bar,
 * toaster) should wear.
 *
 * When a **single app fills the surface** — the focused tab is `docked`
 * (full-area) or `solo` (fullscreen) — the chrome adopts that app's own theme
 * (`app:<id>`), so it reads as one continuous surface with the app rather than
 * a separate shell. In **desktop** mode (the focused tab is `floating`, so
 * windows of different apps share one backdrop) no single app owns the chrome,
 * so it falls back to the neutral global theme ({@link CHROME_THEME_SCOPE}).
 *
 * Provider-free, so it works both inside `<TabsProvider>` (rail, tab bar) and
 * outside it (the `Core.Root` toaster): `useActiveApp` resolves the focused
 * app from the URL when called outside a surface — reactive across focus
 * switches, which mirror the focused tab's route into the URL — and
 * `useFocusedPlacement` reads the module-level focused-placement store. The
 * focused app's `ScopedAppTheme` block is always present (its tab is open), so
 * the scope switch never references a missing style block.
 */
export function useChromeThemeScope(): string {
  const activeApp = useActiveApp();
  const placement = useFocusedPlacement();
  return placementHasAppThemeScope(placement) && activeApp
    ? appThemeScope(activeApp.id)
    : CHROME_THEME_SCOPE;
}
