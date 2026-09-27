import { createContext, useContext, type ReactNode } from "react";

// The theme scope token (`app:<id>`, `fixed:<id>`, `sub:<id>`) of the nearest
// theme boundary, or undefined outside every boundary — where `:root`'s theme
// applies. React context, so it crosses portals the way the theme does.
const IconScopeContext = createContext<string | undefined>(undefined);

/**
 * Tells the icons below which theme scope they are drawn in. The `<Theme>`
 * boundary renders it with its own scope token, so every themed region gets it
 * for free; nothing else should need to. An undefined `scope` keeps the
 * enclosing one, as the boundary itself does.
 */
export function IconScopeProvider({
  scope,
  children,
}: {
  scope: string | undefined;
  children: ReactNode;
}) {
  const parent = useContext(IconScopeContext);
  return (
    <IconScopeContext.Provider value={scope ?? parent}>
      {children}
    </IconScopeContext.Provider>
  );
}

export function useIconScope(): string | undefined {
  return useContext(IconScopeContext);
}
