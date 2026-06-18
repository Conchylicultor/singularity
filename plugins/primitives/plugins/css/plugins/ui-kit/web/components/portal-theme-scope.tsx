import type { ReactNode } from "react"
import {
  PortalForwardProvider,
  usePortalForwardedAttrs,
} from "./portal-forward"

/** The `data-theme-scope` token vocabulary. `ui-kit` owns the attribute contract
 *  (this file), so it owns the token strings too — both producers (theme-engine's
 *  GroupStyle) and consumers (the chrome surfaces, the desktop window frames)
 *  reference these instead of duplicating literals. */
export const appThemeScope = (appId: string) => `app:${appId}`
export const themeScopeSelectors = (token: string) => ({
  light: `[data-theme-scope="${token}"]`,
  dark: `.dark [data-theme-scope="${token}"]`,
})

/** The DOM attribute this signal rides across portals on. */
const THEME_SCOPE_ATTR = "data-theme-scope"

/** Theme-scope token (e.g. "app:home") to stamp on portaled content so it
 *  inherits the originating surface's scoped theme instead of the global :root
 *  chrome theme. Undefined → no attribute → default (global) theme.
 *
 *  Theme scope is the first consumer of the generic {@link PortalForwardProvider}
 *  bridge: it forwards `data-theme-scope` exactly the way plugin lineage and pane
 *  id forward theirs, so portal surfaces re-stamp every forwarded signal at once. */
export function usePortalThemeScope(): string | undefined {
  return usePortalForwardedAttrs()[THEME_SCOPE_ATTR]
}

export function PortalThemeScopeProvider({
  scope,
  children,
}: {
  scope: string | undefined
  children: ReactNode
}) {
  return (
    <PortalForwardProvider name={THEME_SCOPE_ATTR} value={scope}>
      {children}
    </PortalForwardProvider>
  )
}
