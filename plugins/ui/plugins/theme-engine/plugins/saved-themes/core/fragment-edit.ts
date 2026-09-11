import { z } from "zod";
import type { TokenGroupFragment } from "@plugins/ui/plugins/theme-engine/core";
import type { SavedTheme } from "./saved-theme";

const TokenValuesSchema = z.record(z.string(), z.string());

/**
 * One edit to one token group's fragment of a custom theme.
 *
 * - `merge` — each given token is written; an empty string REMOVES the token
 *   from the fragment, so the value the theme inherits through `extends` shows
 *   again (a token row's Reset). Tokens not mentioned are kept. A given `meta`
 *   replaces the old one.
 * - `replace` — the group's fragment becomes exactly these values and `meta`
 *   (a "Fill from…" shortcut). Empty strings are dropped.
 */
export const FragmentEditSchema = z.object({
  groupId: z.string(),
  mode: z.enum(["merge", "replace"]),
  light: TokenValuesSchema,
  dark: TokenValuesSchema,
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type FragmentEdit = z.infer<typeof FragmentEditSchema>;

/**
 * Apply `edit` to a theme's fragment list. The edited group keeps its place in
 * the list; a fragment left with no tokens and no `meta` is removed, so the
 * list stays sparse.
 */
export function applyFragmentEdit(
  fragments: readonly TokenGroupFragment[],
  edit: FragmentEdit,
): SavedTheme["fragments"] {
  const index = fragments.findIndex((f) => f.groupId === edit.groupId);
  const current = index === -1 ? undefined : fragments[index];

  const base =
    edit.mode === "merge" && current
      ? { light: current.light, dark: current.dark, meta: current.meta }
      : { light: {}, dark: {}, meta: undefined };
  const meta = edit.meta ?? base.meta;
  const next: SavedTheme["fragments"][number] = {
    groupId: edit.groupId,
    light: writeTokens(base.light, edit.light),
    dark: writeTokens(base.dark, edit.dark),
    ...(meta === undefined ? {} : { meta }),
  };

  const isEmpty =
    Object.keys(next.light).length === 0 &&
    Object.keys(next.dark).length === 0 &&
    next.meta === undefined;

  const rest = fragments
    .filter((f) => f.groupId !== edit.groupId)
    .map(storedFragment);
  if (isEmpty) return rest;
  if (index === -1) return [...rest, next];
  return fragments.map((f) =>
    f.groupId === edit.groupId ? next : storedFragment(f),
  );
}

// The stored form of a fragment: every token value defined.
function storedFragment(
  f: TokenGroupFragment,
): SavedTheme["fragments"][number] {
  return {
    groupId: f.groupId,
    light: writeTokens(f.light, {}),
    dark: writeTokens(f.dark, {}),
    ...(f.meta === undefined ? {} : { meta: f.meta }),
  };
}

function writeTokens(
  current: TokenGroupFragment["light"],
  written: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [token, value] of Object.entries(current)) {
    if (value !== undefined && value !== "") out[token] = value;
  }
  for (const [token, value] of Object.entries(written)) {
    if (value === "") delete out[token];
    else out[token] = value;
  }
  return out;
}
