import noAdhocSlotIconSize from "./no-adhoc-slot-icon-size";

/**
 * Lint barrel for the `no-adhoc-slot-icon-size` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — mirrors
 * `control-size/no-adhoc-control` and `badge/no-adhoc-chip`). The rule is precise:
 * it fires only on inline icon literals carrying a hardcoded size in an
 * `icon=`/`leading=` slot.
 */
export default {
  name: "icon-auto",
  rules: {
    "no-adhoc-slot-icon-size": noAdhocSlotIconSize,
  },
  ignores: {
    "no-adhoc-slot-icon-size": [],
  },
};
