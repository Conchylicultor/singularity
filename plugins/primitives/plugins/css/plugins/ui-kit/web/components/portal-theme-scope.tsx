import type { ReactNode } from "react";
import {
  PortalForwardProvider,
  usePortalForwardedAttrs,
} from "./portal-forward";

/** The `data-theme-scope` token vocabulary. `ui-kit` owns the attribute contract
 *  (this file), so it owns the token strings too — both producers (theme-engine's
 *  GroupStyle) and consumers (the chrome surfaces, the desktop window frames)
 *  reference these instead of duplicating literals. */
export const appThemeScope = (appId: string) => `app:${appId}`;

/** The prefix only {@link subThemeScope} mints. */
const SUB_THEME_PREFIX = "sub:";

/** A sub-theme's token: `sub:<id>`. Takes the declared sub-theme itself (from
 *  theme-engine's `defineSubTheme`), not its id, so a misspelled id has no
 *  spelling. */
export const subThemeScope = (subTheme: { kind: "sub-theme"; id: string }) =>
  `${SUB_THEME_PREFIX}${subTheme.id}`;

/** Whether a scope token names a sub-theme rather than a whole theme. A
 *  sub-theme sets a few tokens over the theme around it; popups opened from
 *  inside it go back to that surrounding theme (see theme-boundary). */
export const isSubThemeScope = (token: string) =>
  token.startsWith(SUB_THEME_PREFIX);

export const themeScopeSelectors = (token: string) => ({
  light: `[data-theme-scope="${token}"]`,
  dark: `.dark [data-theme-scope="${token}"]`,
});

/** The DOM attribute this signal rides across portals on. */
const THEME_SCOPE_ATTR = "data-theme-scope";

/** Theme-scope token (e.g. "app:home") to stamp on portaled content so it
 *  inherits the originating surface's scoped theme instead of the global :root
 *  chrome theme. Undefined → no attribute → default (global) theme.
 *
 *  Theme scope is the first consumer of the generic {@link PortalForwardProvider}
 *  bridge: it forwards `data-theme-scope` exactly the way plugin lineage and pane
 *  id forward theirs, so portal surfaces re-stamp every forwarded signal at once. */
export function usePortalThemeScope(): string | undefined {
  return usePortalForwardedAttrs()[THEME_SCOPE_ATTR];
}

export function PortalThemeScopeProvider({
  scope,
  children,
}: {
  scope: string | undefined;
  children: ReactNode;
}) {
  // A sub-theme is region-only: a popup opened from inside it wears the theme
  // around the sub-theme, while content relocated within the region keeps it.
  return (
    <PortalForwardProvider
      name={THEME_SCOPE_ATTR}
      value={scope}
      regionOnly={scope !== undefined && isSubThemeScope(scope)}
    >
      {children}
    </PortalForwardProvider>
  );
}
