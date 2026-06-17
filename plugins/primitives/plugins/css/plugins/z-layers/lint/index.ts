import noAdhocZindex from "./no-adhoc-zindex";

/**
 * Lint barrel for the `no-adhoc-zindex` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-zindex` repo-wide
 * as `error`.
 *
 * The rule enforces with ZERO exemptions: every stacking decision in the repo
 * routes through the semantic `z-*` scale. There is intentionally no `ignores`
 * allowlist — a new raw `z-<n>`/`z-[…]` must pick a named layer, not get
 * exempted here.
 */
export default {
  name: "z-layers",
  rules: {
    "no-adhoc-zindex": noAdhocZindex,
  },
};
