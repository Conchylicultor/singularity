import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

/**
 * Floating-window chrome appearance. Per-app (`scope: "app"`): each app's
 * floating windows carry their own titlebar style, read scoped to the window's
 * own app and falling back to the base/global value until that app is forked
 * (mirrors the per-app theme model). The live read keys off the window's active
 * app; the customizer picker edits the currently-forked app's tier.
 *
 * `seamlessTitlebar` drops the titlebar's bottom border and switches its fill
 * from `bg-muted` to `bg-background`, so the bar reads as one continuous surface
 * with the window body (a native, frameless look) instead of a distinct strip.
 */
export const floatingChromeConfig = defineConfig({
  name: "floating-chrome",
  scope: "app",
  fields: {
    seamlessTitlebar: boolField({
      default: false,
      label: "Seamless window titlebar",
    }),
  },
});
