import { useContext } from "react";
import { EndpointError } from "@plugins/infra/plugins/endpoints/web";
import type {
  ColorAdjustment,
  GroupValues,
  Theme,
  ThemeId,
  TokenGroupDescriptor,
  TokenGroupFragment,
} from "@plugins/ui/plugins/theme-engine/core";
import {
  useResolvedTheme,
  useThemeScopeId,
  useThemes,
} from "@plugins/ui/plugins/theme-engine/web";
import { useEditTheme } from "@plugins/ui/plugins/theme-engine/plugins/saved-themes/web";
import { TokenModeContext, type TokenMode } from "./token-mode-context";

export type TokenGroupEditor =
  | { pending: true }
  | {
      pending: false;
      /** The light/dark the editor shows and writes. */
      mode: TokenMode;
      /** What the scope paints for this group, in both modes (before the color adjustment). */
      values: GroupValues;
      /** The color adjustment the scope's theme paints every color through. */
      colorAdjust: ColorAdjustment;
      /**
       * The scope's own edits to this group: its custom theme's fragment. Only
       * these can be reset — everything else is inherited through `extends`.
       * Undefined when the scope's theme is a code or tweakcn theme (read-only:
       * the first edit copies it into a custom theme).
       */
      own: TokenGroupFragment | undefined;
      /**
       * Editor state of the fragment the scope inherits this group from (the
       * nearest one above `own` in the `extends` chain) — shadow's params. It
       * says how the inherited values were made, so an editor can start from it.
       */
      inheritedMeta: Record<string, unknown> | undefined;
      /** Write one token, in the editor's mode ("both" writes light and dark). */
      setToken: (token: string, value: string) => void;
      /** Clear the scope's own value for one token, so the inherited one shows again. */
      resetToken: (token: string) => void;
      /** Replace the whole group with a shortcut's values (a "Fill from…" pick). */
      fillFrom: (fragment: TokenGroupFragment) => void;
    };

/**
 * The customizer's read + write for one token group, in the scope the
 * surrounding `ThemeScopeProvider` names: it reads the values the scope's theme
 * resolves to and writes through `useEditTheme` — the one place theme edits
 * land. A section never touches config or a theme row itself.
 *
 * Pending while the scope's theme is not known yet: an editor must render its
 * loading state then, because `useEditTheme` refuses to act on an unknown theme.
 */
export function useTokenGroupEditor(
  group: TokenGroupDescriptor,
): TokenGroupEditor {
  const scopeId = useThemeScopeId();
  const mode = useContext(TokenModeContext);
  const resolved = useResolvedTheme(scopeId);
  const themes = useThemes();
  const edits = useEditTheme(scopeId);

  if (resolved.pending || themes.pending) return { pending: true };

  const { themesById } = themes;
  const theme = themeOf(themesById, resolved.themeId);
  const own =
    theme.source === "custom" ? fragmentOf(theme, group.id) : undefined;
  const inheritedMeta = nearestFragment(
    themesById,
    theme.source === "custom" ? theme.extends : theme.id,
    group.id,
  )?.meta;

  const tokenValues = (token: string, value: string) => ({
    ...(mode === "dark" ? {} : { light: { [token]: value } }),
    ...(mode === "light" ? {} : { dark: { [token]: value } }),
  });

  return {
    pending: false,
    mode,
    values: resolved.theme.groups[group.id]!,
    colorAdjust: resolved.theme.colorAdjust,
    own,
    inheritedMeta,
    setToken: (token, value) =>
      settle(edits.setTokens(group.id, tokenValues(token, value))),
    resetToken: (token) =>
      settle(edits.setTokens(group.id, tokenValues(token, ""))),
    fillFrom: (fragment) => settle(edits.fillFrom(fragment)),
  };
}

export type ColorAdjustEditor =
  | { pending: true }
  | {
      pending: false;
      /** The adjustment the scope's theme paints through (its own, or inherited). */
      adjustment: ColorAdjustment;
      /** Change part of it; the other fields keep their current values. */
      set: (patch: Partial<ColorAdjustment>) => void;
    };

/**
 * The customizer's read + write for the scope's color adjustment — the
 * `useTokenGroupEditor` of `Theme.colorAdjust`. Pending while the scope's theme
 * is not known yet.
 */
export function useColorAdjustEditor(): ColorAdjustEditor {
  const scopeId = useThemeScopeId();
  const resolved = useResolvedTheme(scopeId);
  const edits = useEditTheme(scopeId);
  if (resolved.pending) return { pending: true };
  return {
    pending: false,
    adjustment: resolved.theme.colorAdjust,
    set: (patch) => settle(edits.setColorAdjust(patch)),
  };
}

// An edit is fired from an event handler, so nothing awaits it. An endpoint
// failure was already surfaced by the mutation's global error toast; anything
// else is a bug and propagates.
function settle(edit: Promise<void>): void {
  void edit.catch((err: unknown) => {
    if (err instanceof EndpointError) return;
    throw err;
  });
}

function themeOf(themesById: ReadonlyMap<ThemeId, Theme>, id: ThemeId): Theme {
  const theme = themesById.get(id);
  if (!theme) {
    throw new Error(
      `[theme-customizer] the scope resolves to theme "${id}", which the theme list does not have.`,
    );
  }
  return theme;
}

function fragmentOf(
  theme: Theme,
  groupId: string,
): TokenGroupFragment | undefined {
  return theme.fragments.find((f) => f.groupId === groupId);
}

// The leaf-most fragment for `groupId` in the chain starting at `id` — the one
// whose values win for that group.
function nearestFragment(
  themesById: ReadonlyMap<ThemeId, Theme>,
  id: ThemeId | undefined,
  groupId: string,
): TokenGroupFragment | undefined {
  const seen = new Set<ThemeId>();
  for (let current = id; current !== undefined;) {
    if (seen.has(current)) {
      throw new Error(
        `[theme-customizer] theme "${current}" has an extends cycle.`,
      );
    }
    seen.add(current);
    const theme = themeOf(themesById, current);
    const fragment = fragmentOf(theme, groupId);
    if (fragment) return fragment;
    current = theme.extends;
  }
  return undefined;
}
