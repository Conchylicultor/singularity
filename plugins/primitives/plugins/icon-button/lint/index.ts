import preferIconButton from "./prefer-icon-button";

/**
 * Lint barrel for the `prefer-icon-button` rule, co-located with the curated
 * `IconButton` primitive it steers toward. The root `eslint.config.ts`
 * auto-discovers this default export and registers `prefer-icon-button` repo-wide
 * as `error`.
 *
 * No `ignores`: the rule is precise (fires only on a standalone
 * `<Button aspect="icon">` whose only child is a react-icons glyph). Genuine
 * keep-bare one-offs (e.g. a per-model glyph size IconButton can't express)
 * carry a per-site `// eslint-disable-next-line icon-button/prefer-icon-button -- <reason>`.
 */
export default {
  name: "icon-button",
  rules: {
    "prefer-icon-button": preferIconButton,
  },
};
