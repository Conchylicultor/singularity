import noRawActionsSlot from "./no-raw-actions-slot";

/**
 * Lint barrel for the `no-raw-actions-slot` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers
 * `row-actions/no-raw-actions-slot` repo-wide as `error`.
 *
 * `ignores` is EMPTY and stays empty. This rule asks a dataflow question — does
 * an `actions`-shaped prop reach the `RowActions` primitive? — precisely so that
 * a duplicate cluster cannot satisfy it in place. A path allowlist is the escape
 * hatch that let the previous duplicate survive `no-uncoupled-hover-reveal`
 * (`ee2dfe424`); adding one here would give this rule the same defect. A genuine
 * non-row `actions` slot escapes by NAME (call it `trailing`), not by path.
 */
export default {
  name: "row-actions",
  rules: {
    "no-raw-actions-slot": noRawActionsSlot,
  },
  ignores: {
    "no-raw-actions-slot": [],
  },
};
