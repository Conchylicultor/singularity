import noFillColorAsText from "./no-fill-color-as-text";

/**
 * Lint barrel for `no-fill-color-as-text`: text uses the palette's
 * `primary-text` / `destructive-text` / `success-text` twins, never the fill colours. Auto-
 * discovered by the root `eslint.config.ts` and enabled repo-wide as `error`.
 */
export default {
  name: "color-palette",
  rules: {},
  // A class rule is a factory over the shared class-token walk — see
  // @plugins/framework/plugins/tooling/plugins/lint/core/class-token-walk.ts.
  classRules: {
    "no-fill-color-as-text": noFillColorAsText,
  },
};
