import { createContext, useContext, type ReactNode } from "react"

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
