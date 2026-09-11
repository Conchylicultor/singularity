import type { ThemeId } from "@plugins/ui/plugins/theme-engine/core";
import type { SavedThemeInUse, ThemeScopeRef } from "../../core";

/** One scope's theme choice: the desktop (no `scopeId`) or one app. */
export interface ThemeSelection {
  scopeId?: string;
  themeId: ThemeId;
}

export type DeletePlan =
  | { kind: "refuse"; inUse: SavedThemeInUse }
  | { kind: "delete"; reassign: ThemeScopeRef[] };

/**
 * Whether a saved theme may be deleted given every scope's current selection.
 * A scope still selecting it would be left naming a theme that no longer
 * exists, so the delete is refused — unless the caller asked to `reassign`,
 * in which case those scopes move to the Default theme first.
 */
export function planDelete(
  theme: { id: ThemeId; label: string },
  selections: readonly ThemeSelection[],
  reassign: boolean,
): DeletePlan {
  const usedBy = selections
    .filter((s) => s.themeId === theme.id)
    .map((s) => (s.scopeId === undefined ? {} : { scopeId: s.scopeId }));
  if (usedBy.length > 0 && !reassign) {
    return {
      kind: "refuse",
      inUse: {
        message: `"${theme.label}" is still selected by ${describeScopes(usedBy)}. Pick another theme there first, or delete with reassign to move them to Default.`,
        usedBy,
      },
    };
  }
  return { kind: "delete", reassign: usedBy };
}

function describeScopes(scopes: readonly ThemeScopeRef[]): string {
  return scopes
    .map((s) => (s.scopeId === undefined ? "the desktop" : s.scopeId))
    .join(", ");
}
