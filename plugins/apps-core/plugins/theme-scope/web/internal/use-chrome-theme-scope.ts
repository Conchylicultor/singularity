import { appThemeScope } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useActiveApp } from "@plugins/apps-core/web";
import {
  useFocusedPlacement,
  placementHasAppThemeScope,
} from "@plugins/apps-core/plugins/tabs/web";

/**
 * The theme scope owned by the focused full-surface app — or `undefined` when no
 * single app fills the surface (desktop / floating focus → global `:root`).
 *
 * Returns `app:<id>` when the focused tab's placement is `themeScope:"app"`
 * (`docked` full-area or `solo` fullscreen) AND an app is active; otherwise
 * `undefined`. This is the single definition shared by BOTH:
 *  - the cross-app chrome surfaces (rail, tab bar, toaster), via
 *    `useChromeThemeScope`, which adopt the focused app's theme so the shell
 *    reads as one continuous surface with the app; and
 *  - the `:root` token values, via theme-engine's `ThemeInjector`, so the base
 *    layer carries the focused full-surface app's theme (the "base layer owns
 *    `:root`" model). The common single-docked-app case emits zero scoped
 *    blocks and is frame-0 trivially correct.
 *
 * Keeping chrome and `:root` on one definition means they can never disagree
 * about which app owns the surface.
 *
 * Provider-free, so it works both inside `<TabsProvider>` (rail, tab bar) and
 * outside it (the `Core.Root` toaster + `ThemeInjector`): `useActiveApp`
 * resolves the focused app from the URL when called outside a surface —
 * reactive across focus switches, which mirror the focused tab's route into the
 * URL — and `useFocusedPlacement` reads the module-level focused-placement
 * store.
 */
export function useRootThemeScope(): string | undefined {
  const activeApp = useActiveApp();
  const placement = useFocusedPlacement();
  return placementHasAppThemeScope(placement) && activeApp
    ? appThemeScope(activeApp.id)
    : undefined;
}

/**
 * The `data-theme-scope` token the cross-app chrome surfaces (app rail, tab bar,
 * toaster) should wear — or `undefined` to inherit the desktop `:root` theme.
 *
 * Identical to `useRootThemeScope` (chrome and `:root` share ONE definition):
 * when a single app fills the surface the chrome adopts that app's own theme
 * (`app:<id>`); in desktop/floating focus it returns `undefined` (no
 * `data-theme-scope`, so the surface inherits the global desktop `:root`).
 *
 * Because `:root` now carries the focused app's theme, the focused docked tab's
 * `data-theme-scope` is redundant with `:root` (matches but adds nothing); it
 * still matters for any OTHER simultaneously-visible surface whose theme differs.
 */
export function useChromeThemeScope(): string | undefined {
  return useRootThemeScope();
}
