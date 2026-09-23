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
