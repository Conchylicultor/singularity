import { createContext, useContext, type ReactNode } from "react";

// The effective config scopeId for theme reads/writes inside the customizer.
// `undefined` means "edit base/global" — the default everywhere, so non-customizer
// consumers (e.g. the ThemeInjector) are unaffected. The customizer provides a
// concrete `app:<id>` only when the current app has been explicitly forked.
const ThemeScopeContext = createContext<string | undefined>(undefined);

export function ThemeScopeProvider({
  scopeId,
  children,
}: {
  scopeId?: string;
  children: ReactNode;
}) {
  return (
    <ThemeScopeContext.Provider value={scopeId}>
      {children}
    </ThemeScopeContext.Provider>
  );
}

// The effective theme scopeId. Returns undefined outside the customizer (or when
// the current app is un-forked), so `useConfig(d, { scopeId })` reads/writes base.
export function useThemeScopeId(): string | undefined {
  return useContext(ThemeScopeContext);
}
