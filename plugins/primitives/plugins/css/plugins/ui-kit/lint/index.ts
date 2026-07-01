import noGrouplessDropdownMenuLabel from "./no-groupless-dropdown-menu-label";

/**
 * Lint barrel for ui-kit dropdown-menu safety. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * `no-groupless-dropdown-menu-label` bans a `DropdownMenuLabel` with no
 * `DropdownMenuGroup`/`DropdownMenuSection` ancestor — base-ui's `Menu.GroupLabel`
 * hard-crashes (#31) without a `Menu.Group` context. Use the `DropdownMenuSection`
 * primitive, which renders the group+label pair together.
 */
export default {
  name: "ui-kit",
  rules: {
    "no-groupless-dropdown-menu-label": noGrouplessDropdownMenuLabel,
  },
};
