import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { ThemeCustomizerBody } from "./components/theme-customizer";

/**
 * Deliberately app-less: the customizer opens inside whichever app you are
 * currently in (it styles that app's theme scope), so it has no single owning
 * `AppRef` and callers compose `activeApp.path + themeCustomizerRoute.path({})`.
 * Keeping the segment here rather than inline at call sites means a rename
 * still propagates to every link.
 */
export const themeCustomizerRoute = defineRoute({
  id: "theme-customizer",
  segment: "theme-customizer",
});

export const themeCustomizerPane = Pane.define({
  route: themeCustomizerRoute,
  component: ThemeCustomizerBody,
  width: 440,
});
