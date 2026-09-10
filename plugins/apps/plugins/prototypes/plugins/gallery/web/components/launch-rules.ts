import {
  humanizeToken,
  type OptionPicks,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * The options rule, as both launch prompts state it. The prompts are the only
 * instruction guaranteed to reach a prototype agent, and the owner chose
 * instructions — not a check — as the guard against agents drawing their own
 * switchers, so it has to be said here, in one wording.
 */
export const OPTIONS_RULE = [
  "If the design has variants to flip between (a palette, a layout, a density),",
  'declare them as options — `<meta name="prototype-option">` plus the default on',
  "`<html data-…>`, see `prototypes/CLAUDE.md` § Options — and the app draws the",
  "picker. Never build a switcher, toggle bar or settings panel into the page for",
  "that.",
].join("\n");

/**
 * The line that tells an Improve agent which variant the user is looking at —
 * or nothing, when every option is on its default (the page as written).
 */
export function pickedVariantLine(picks: OptionPicks): string | null {
  const entries = Object.entries(picks);
  if (entries.length === 0) return null;
  const list = entries
    .map(([option, value]) => `${option} = ${value} (${humanizeToken(value)})`)
    .join(", ");
  return `The user is looking at it with these options picked: ${list}. The page's own defaults are on its \`<html data-…>\`.`;
}
