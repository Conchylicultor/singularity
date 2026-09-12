import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";
import type { SubTheme, Theme, ThemeId, TokenGroupDescriptor } from "../core";

export interface VariantGroupContribution {
  id: string;
  componentLabel: string;
  /**
   * A pluggable component's visual variant picker (sidebar framing, tab bar,
   * progress bar, window titlebar) — a choice that survives a theme swap. Token
   * values are never picked here: they belong to the theme a scope selects.
   */
  component: ComponentType;
}

/**
 * A token group: the CSS variables it declares and their schema defaults. Its
 * VALUES come from the theme a scope selects (`useResolvedTheme`), never from a
 * per-group setting.
 */
export interface TokenGroupContribution {
  id: string;
  label: string;
  descriptor: TokenGroupDescriptor;
}

/** A catalog row a browse source offers before it is saved (a tweakcn community theme). */
export interface ThemeSourceEntry {
  id: string;
  label: string;
  tags: string[];
  /** The entry's color-palette token values (`primary`, `background`, …) per mode — enough to draw a swatch. */
  preview: { light: Record<string, string>; dark: Record<string, string> };
  /** Set when this entry is already saved — the resident theme it became. */
  savedThemeId?: ThemeId;
}

/**
 * Where themes beyond the code ones come from. Theme-engine names no source:
 * each arrives through this slot.
 *
 * - `resident` — themes that exist now and can be selected and painted (the
 *   saved-themes table). `useThemes` returns `undefined` while still loading,
 *   which is distinct from "no themes": the painter injects nothing while any
 *   resident source is pending, so a half-loaded list is never painted as final.
 * - `browse` — a catalog to pick from. An entry becomes selectable only once
 *   `adopt` has saved it, which resolves to the resident theme's id.
 */
export type ThemeSourceContribution =
  | {
      kind: "resident";
      id: string;
      useThemes: () => Theme[] | undefined;
    }
  | {
      kind: "browse";
      id: string;
      useEntries: () => ThemeSourceEntry[] | undefined;
      /**
       * Save the entry and resolve to the resident theme it became — already
       * in `useThemes()` when this settles, so the caller can select it
       * straight away. Rejects with the endpoint's error; the caller surfaces it.
       */
      adopt: (entryId: string) => Promise<ThemeId>;
    };

export type ThemesState =
  | { pending: true }
  | { pending: false; themesById: ReadonlyMap<ThemeId, Theme> };

/**
 * Every theme that can be selected right now: the code themes
 * (`ThemeEngine.Theme`) plus every resident source's. Pending while any
 * resident source is still loading.
 *
 * Two themes claiming one id is a bug, not a precedence rule, so it throws.
 *
 * The state (and its map) is the SAME object for as long as its inputs are (the
 * slot list and each source's list keep their identity until they change), so
 * a consumer can memoize a resolution on it instead of redoing it every render.
 */
export function useThemes(): ThemesState {
  const codeThemes = ThemeEngine.Theme.useContributions();
  // ThemeSource contributions are static slot entries; the count never
  // changes, so calling each resident source's hook here keeps hook order stable.
  const resident = ThemeEngine.ThemeSource.useContributions().flatMap((s) =>
    s.kind === "resident" ? [s.useThemes()] : [],
  );
  const lists: (readonly Theme[])[] = [];
  for (const themes of resident) {
    if (themes === undefined) return THEMES_PENDING;
    lists.push(themes);
  }
  return themesStateOf(codeThemes, lists);
}

const THEMES_PENDING: ThemesState = { pending: true };

// The last state built per code-theme list, with the resident lists it came
// from: reused while every list is the same object.
const builtStates = new WeakMap<
  readonly Theme[],
  { resident: readonly (readonly Theme[])[]; state: ThemesState }
>();

function themesStateOf(
  codeThemes: readonly Theme[],
  resident: readonly (readonly Theme[])[],
): ThemesState {
  const built = builtStates.get(codeThemes);
  if (
    built &&
    built.resident.length === resident.length &&
    built.resident.every((list, i) => list === resident[i])
  ) {
    return built.state;
  }
  const themesById = new Map<ThemeId, Theme>();
  for (const theme of [...codeThemes, ...resident.flat()]) {
    if (themesById.has(theme.id)) {
      throw new Error(
        `[theme-engine] two themes claim the id "${theme.id}" — theme ids must be unique across code themes and every ThemeSource.`,
      );
    }
    themesById.set(theme.id, theme);
  }
  const state: ThemesState = { pending: false, themesById };
  builtStates.set(codeThemes, { resident, state });
  return state;
}

export const ThemeEngine = {
  VariantGroup: defineRenderSlot<VariantGroupContribution>({
    docLabel: (p) => p.componentLabel,
  }),
  TokenGroup: defineSlot<TokenGroupContribution>({ docLabel: (p) => p.label }),
  Theme: defineSlot<Theme>({ docLabel: (p) => p.label }),
  /**
   * Sub-themes (`defineSubTheme`): painted for as long as they are
   * contributed, whether or not a region wears one yet, so the pre-paint cache
   * holds them and a region that mounts later never repaints.
   */
  SubTheme: defineSlot<SubTheme>({ docLabel: (p) => p.label }),
  ThemeSource: defineSlot<ThemeSourceContribution>({ docLabel: (p) => p.id }),
};
