import noAdhocControl from "./no-adhoc-control";

/**
 * Lint barrel for the `no-adhoc-control` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-control` repo-wide
 * as `error`.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — mirrors
 * `badge/no-adhoc-chip`). The rule is precise: it fires only on the genuine
 * escape hatches (importing `buttonVariants`, or a raw `<button>`/`<a>` carrying
 * the fixed-height + horizontal-padding + rounded fingerprint), all of which
 * have a sanctioned primitive home (`<Button>`/`<IconButton>`/`<ButtonGroup>`).
 */
export default {
  name: "control-size",
  rules: {
    "no-adhoc-control": noAdhocControl,
  },
  ignores: {
    "no-adhoc-control": [],
  },
};
