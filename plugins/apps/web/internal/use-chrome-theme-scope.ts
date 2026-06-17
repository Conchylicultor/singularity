import { appThemeScope } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useActiveApp } from "./use-active-app";
import { useFocusedPlacement } from "./use-tabs";
import { placementHasAppThemeScope } from "./placement-registry";

/**
 * The `data-theme-scope` token the cross-app chrome surfaces (app rail, tab bar,
 * toaster) should wear — or `undefined` to inherit the desktop `:root` theme.
 *
 * When a **single app fills the surface** — the focused tab is `docked`
 * (full-area) or `solo` (fullscreen) — the chrome adopts that app's own theme
 * (`app:<id>`), so it reads as one continuous surface with the app rather than
 * a separate shell. In **desktop** mode (the focused tab is `floating`, so
 * windows of different apps share one backdrop) no single app owns the chrome,
 * so it returns `undefined`: no `data-theme-scope` attribute, so the surface
 * inherits the global desktop `:root` theme.
 *
 * Provider-free, so it works both inside `<TabsProvider>` (rail, tab bar) and
 * outside it (the `Core.Root` toaster): `useActiveApp` resolves the focused
 * app from the URL when called outside a surface — reactive across focus
 * switches, which mirror the focused tab's route into the URL — and
 * `useFocusedPlacement` reads the module-level focused-placement store. The
 * focused app's scope block (if forked) is always present (its tab is open), so
 * the scope switch never references a missing style block; an unforked focused
 * app simply inherits `:root`, same as the desktop fallback.
 */
export function useChromeThemeScope(): string | undefined {
  const activeApp = useActiveApp();
  const placement = useFocusedPlacement();
  return placementHasAppThemeScope(placement) && activeApp
    ? appThemeScope(activeApp.id)
    : undefined;
}
