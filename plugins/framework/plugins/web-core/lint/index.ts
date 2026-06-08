import noMenuItemOnSelect from "./no-menu-item-on-select";

/**
 * Lint barrel for `no-menu-item-on-select`. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * `ignores` is intentionally EMPTY: the rule is precise (it fires only on the
 * capitalized Base UI menu-item wrappers carrying `onSelect`) and auto-fixes to
 * `onClick`, so there is no legitimate escape hatch to allowlist.
 */
export default {
  name: "web-core",
  rules: {
    "no-menu-item-on-select": noMenuItemOnSelect,
  },
  ignores: {
    "no-menu-item-on-select": [],
  },
};
