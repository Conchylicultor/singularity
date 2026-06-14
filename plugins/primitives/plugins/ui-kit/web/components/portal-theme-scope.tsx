import { createContext, useContext, type ReactNode } from "react"

/** The `data-theme-scope` token vocabulary. `ui-kit` owns the attribute contract
 *  (this file), so it owns the token strings too — both producers (theme-engine's
 *  GroupStyle) and consumers (the chrome surfaces, the desktop window frames)
 *  reference these instead of duplicating literals. */
export const CHROME_THEME_SCOPE = "chrome"
export const appThemeScope = (appId: string) => `app:${appId}`
export const themeScopeSelectors = (token: string) => ({
  light: `[data-theme-scope="${token}"]`,
  dark: `.dark [data-theme-scope="${token}"]`,
})

const PortalThemeScopeContext = createContext<string | undefined>(undefined)

/** Theme-scope token (e.g. "app:home") to stamp on portaled content so it
 *  inherits the originating surface's scoped theme instead of the global :root
 *  chrome theme. Undefined → no attribute → default (global) theme. */
export function usePortalThemeScope(): string | undefined {
  return useContext(PortalThemeScopeContext)
}

export function PortalThemeScopeProvider({
  scope,
  children,
}: {
  scope: string | undefined
  children: ReactNode
}) {
  return (
    <PortalThemeScopeContext.Provider value={scope}>
      {children}
    </PortalThemeScopeContext.Provider>
  )
}
