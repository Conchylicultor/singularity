import {
  isBuiltInThemeId,
  type ThemeId,
} from "@plugins/ui/plugins/theme-engine/core";

export type ExtendsCheck = { ok: true } | { ok: false; reason: string };

/**
 * May saved theme `themeId` extend `target`?
 *
 * The rule the server can actually enforce, given it sees only the stored half
 * of the theme set (theme-engine's id grammar tells the halves apart):
 *
 * - a bare `target` names a code theme. The server cannot see code, so it
 *   trusts the caller, who picked the id from its live theme list. Code themes
 *   extend nothing, so the chain ends there.
 * - a `<source>:<key>` target must be a saved row, and walking its chain must
 *   never come back to `themeId` — the one way a cycle can be written, since a
 *   re-import upserts onto an id that may already have descendants.
 *
 * `savedParents` maps every saved theme's id to its own `extends`.
 */
export function checkExtendsTarget(
  themeId: ThemeId,
  target: ThemeId,
  savedParents: ReadonlyMap<ThemeId, ThemeId | undefined>,
): ExtendsCheck {
  const seen = new Set<ThemeId>();
  let current: ThemeId | undefined = target;
  while (current !== undefined && !isBuiltInThemeId(current)) {
    if (current === themeId || seen.has(current)) {
      return {
        ok: false,
        reason: `"${themeId}" cannot extend "${target}": the extends chain would loop back to "${current}"`,
      };
    }
    if (!savedParents.has(current)) {
      return {
        ok: false,
        reason:
          current === target
            ? `"${themeId}" cannot extend "${target}": no saved theme has that id`
            : `"${themeId}" cannot extend "${target}": its chain reaches "${current}", which no longer exists`,
      };
    }
    seen.add(current);
    current = savedParents.get(current);
  }
  return { ok: true };
}
