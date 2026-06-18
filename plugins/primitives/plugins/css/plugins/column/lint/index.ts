import noInertFillBody from "./no-inert-fill-body";

/**
 * Lint barrel for the `no-inert-fill-body` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-inert-fill-body`
 * repo-wide as `error`.
 *
 * The rule guards `Column`'s `scrollBody={false}` API: that mode wraps the body
 * in a plain block div, so a `fill`-bearing body (`Scroll`/`Clip`/`Column`) is
 * inert and its overflow never engages. `ignores` is intentionally EMPTY — the
 * pattern is always a bug; the body must own its height/overflow, or the caller
 * should use the managed scroll body. A genuine one-off escapes per-site with
 * `// eslint-disable-next-line column/no-inert-fill-body -- <reason>`.
 */
export default {
  name: "column",
  rules: {
    "no-inert-fill-body": noInertFillBody,
  },
  ignores: {
    "no-inert-fill-body": [],
  },
};
