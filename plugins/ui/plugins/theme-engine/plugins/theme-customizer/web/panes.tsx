import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { ThemeCustomizerBody } from "./components/theme-customizer";

/**
 * Deliberately app-less: the customizer opens inside whichever app you are
 * currently in (it styles that app's theme scope), so it has no single owning
 * `AppRef` and callers compose `activeApp.path + themeCustomizerRoute.path({})`.
 * Keeping the segment here rather than inline at call sites means a rename
 * still propagates to every link.
 *
 * Hence NO `Pane.define({ app })` either: a home app would make Expand rip the
 * customizer out of the app you are restyling, which is the one place it has to
 * stay. Its Expand correctly stays same-app.
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
