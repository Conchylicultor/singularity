import classFieldMustBeBranded from "./class-field-must-be-branded";
import noGrouplessDropdownMenuLabel from "./no-groupless-dropdown-menu-label";
import noButtonShadow from "./no-button-shadow";

/**
 * Lint barrel for ui-kit. The root `eslint.config.ts` auto-discovers this default
 * export and registers each rule repo-wide as `error`.
 *
 * `no-groupless-dropdown-menu-label` bans a `DropdownMenuLabel` with no
 * `DropdownMenuGroup`/`DropdownMenuSection` ancestor — base-ui's `Menu.GroupLabel`
 * hard-crashes (#31) without a `Menu.Group` context. Use the `DropdownMenuSection`
 * primitive, which renders the group+label pair together.
 *
 * `class-field-must-be-branded` is the residual plug on the `ClassName` brand:
 * the brand relocates class literals into `cn()` only for fields that declare it,
 * so this rule requires a field NAMED for classes to be TYPED for them. It reads
 * annotation shapes and tokenizes nothing, so it takes no class-token walk and
 * stays an ordinary `rules` entry rather than a `classRules` factory.
 *
 * `no-button-shadow` bans a `shadow-*` on a `<Button>` / `<IconButton>`. A
 * shadow means the button floats over content, and most variants are
 * see-through there (`outline` is `input/30` in dark mode), so the content
 * shows behind the label. `variant="floating"` is the solid one. It reads
 * class tokens, so it is a `classRules` factory taking the shared walk.
 */
export default {
  name: "ui-kit",
  rules: {
    "class-field-must-be-branded": classFieldMustBeBranded,
    "no-groupless-dropdown-menu-label": noGrouplessDropdownMenuLabel,
  },
  classRules: {
    "no-button-shadow": noButtonShadow,
  },
};
