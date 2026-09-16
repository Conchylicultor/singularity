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

/**
 * The line that points an Improve agent at the picks as they are NOW — the
 * user may flip a variant after launching it, and {@link pickedVariantLine} is
 * a snapshot from launch time. Also says how to look at a variant without
 * changing what the user sees: the picks are the user's, and nothing an agent
 * does may write them.
 */
export function currentPicksLine(name: string): string {
  return [
    `The user may change the options while you work: \`./singularity prototype options ${name}\``,
    "prints the current picks and the URL of that exact variant. To render a",
    "variant yourself, load the prototype's document with `?<option>=<value>` —",
    "never change the user's picks.",
  ].join("\n");
}
