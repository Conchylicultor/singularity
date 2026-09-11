import type {
  ColorAdjustment,
  ThemeId,
  TokenGroupFragment,
} from "@plugins/ui/plugins/theme-engine/core";
import type { SavedTheme } from "../../core";

interface ThemeLayer {
  extends?: ThemeId;
  fragments: readonly TokenGroupFragment[];
  colorAdjust?: ColorAdjustment;
}

/** The folded child, in the stored form: every token value defined. */
interface FoldedLayer {
  extends?: ThemeId;
  fragments: SavedTheme["fragments"];
  colorAdjust?: ColorAdjustment;
}

/**
 * Rewrite `child` so it no longer needs `parent` and still resolves to exactly
 * what it painted: the parent's values move into the child wherever the child
 * was silent, and the child now extends the parent's own parent.
 *
 * Equivalent under `resolveTheme` because resolution already reads the parent
 * first and lets the child's non-empty values win — this does the same overlay
 * once, ahead of time. `meta` follows the value it describes: the child's if it
 * has one for that group, else the parent's.
 */
export function foldParentInto(
  parent: ThemeLayer,
  child: ThemeLayer,
): FoldedLayer {
  const groupIds = [
    ...new Set([...parent.fragments, ...child.fragments].map((f) => f.groupId)),
  ];
  const fragments = groupIds.map((groupId) => {
    const p = parent.fragments.find((f) => f.groupId === groupId);
    const c = child.fragments.find((f) => f.groupId === groupId);
    const meta = c?.meta ?? p?.meta;
    return {
      groupId,
      light: overlay(p?.light, c?.light),
      dark: overlay(p?.dark, c?.dark),
      ...(meta === undefined ? {} : { meta }),
    };
  });
  const colorAdjust = child.colorAdjust ?? parent.colorAdjust;
  return {
    ...(parent.extends === undefined ? {} : { extends: parent.extends }),
    fragments,
    ...(colorAdjust === undefined ? {} : { colorAdjust }),
  };
}

function overlay(
  under: TokenGroupFragment["light"] | undefined,
  over: TokenGroupFragment["light"] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const layer of [under ?? {}, over ?? {}]) {
    for (const [token, value] of Object.entries(layer)) {
      if (value !== undefined && value !== "") out[token] = value;
    }
  }
  return out;
}
