import noDeadSpacing from "./no-dead-spacing";

/**
 * Lint barrel for the `no-dead-spacing` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-dead-spacing` repo-wide
 * as `error`.
 *
 * No `ignores` allowlist and no sanctioned per-site escape: a spacing class
 * that does not exist compiles to nothing, so disabling the rule never makes
 * the code do what it says. Declare the `@utility` in app.css, or restructure.
 */
export default {
  name: "space-ramp",
  rules: {},
  // Class rules are FACTORIES: they read class tokens, so they take the one
  // shared walk from `buildLintConfig` instead of hand-copying it. See
  // @plugins/framework/plugins/tooling/plugins/lint/core/class-token-walk.ts.
  classRules: {
    "no-dead-spacing": noDeadSpacing,
  },
};
