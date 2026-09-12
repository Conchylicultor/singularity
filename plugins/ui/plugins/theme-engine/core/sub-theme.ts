import type { TokenGroupFragment } from "./define-token-group";
import { duplicateGroupId } from "./theme";

/**
 * A sub-theme: a few token values that one region of the screen wears ON TOP of
 * the theme around it — the website's page type scale over the site's palette.
 *
 * Unlike a `Theme`, it is never selected for a scope and is never
 * resolved against schema defaults. A region opts in with
 * `<Theme name={subThemeScope(subTheme)}>`, and every token the sub-theme does
 * not name keeps whatever the surrounding theme paints, by plain CSS
 * inheritance. So a sub-theme that only sets sizes follows the app's palette
 * wherever it goes, including after the app's theme is switched.
 *
 * Its values are painted as written: the surrounding theme's color adjustment
 * does not apply to them.
 */
export interface SubTheme {
  /** The discriminant `subThemeScope` requires, so only a declared sub-theme mints a token. */
  kind: "sub-theme";
  id: string;
  label: string;
  /** Sparse: at most one per group; each names the same tokens in light and dark. */
  fragments: TokenGroupFragment[];
}

/** Kebab-case: the id lands in a CSS attribute selector and a `<style>` id. */
const SUB_THEME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Declare a sub-theme, contributed through `ThemeEngine.SubTheme`. */
export function defineSubTheme(def: {
  id: string;
  label: string;
  fragments: TokenGroupFragment[];
}): SubTheme {
  if (!SUB_THEME_ID.test(def.id)) {
    throw new Error(
      `defineSubTheme: id "${def.id}" must be kebab-case (lowercase letters, digits and single dashes).`,
    );
  }
  const dup = duplicateGroupId(def.fragments);
  if (dup !== undefined) {
    throw new Error(
      `defineSubTheme("${def.id}"): two fragments for token group "${dup}" — a sub-theme has at most one per group.`,
    );
  }
  for (const fragment of def.fragments) {
    assertSameTokensInBothModes(def.id, fragment);
  }
  return { ...def, kind: "sub-theme" };
}

/**
 * A sub-theme's light block also matches in dark mode (the dark block only
 * overrides what it names), so a token set in light alone would leak its light
 * value onto a dark page. Requiring both modes to name the same tokens, each
 * with a real value, rules that out. `both(…)` satisfies it for a mode-free
 * group.
 */
function assertSameTokensInBothModes(
  id: string,
  fragment: TokenGroupFragment,
): void {
  const named = (values: TokenGroupFragment["light"]) =>
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([token, value]) => {
        if (value === "") {
          throw new Error(
            `defineSubTheme("${id}"): token "${token}" of group "${fragment.groupId}" is empty — leave it out to keep the surrounding theme's value.`,
          );
        }
        return token;
      })
      .sort();
  const light = named(fragment.light);
  const dark = named(fragment.dark);
  if (light.join(",") !== dark.join(",")) {
    throw new Error(
      `defineSubTheme("${id}"): group "${fragment.groupId}" names different tokens in light (${light.join(", ")}) and dark (${dark.join(", ")}) — a sub-theme sets each token in both modes.`,
    );
  }
}
