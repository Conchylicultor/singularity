import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { prototypesApp } from "@plugins/apps/plugins/prototypes/plugins/shell/core";
import { PresentPage } from "./components/present-page";

export const prototypePresentRoute = defineRoute({
  id: "prototypes-present",
  segment: "present/:name/:sha?",
});

/**
 * The prototype presented as a page of its own: `present/<id>`, or
 * `present/<id>/<sha>` for a recorded version. What the Present menu's "New
 * browser tab" opens (chromeless, `?embed=1`), so the new tab carries the same
 * options picker as the in-app presentations instead of the bare document.
 *
 * A root route, not a child of the gallery: opened alone it is the only column,
 * so it fills the surface.
 */
export const prototypePresentPane = Pane.define({
  route: prototypePresentRoute,
  app: prototypesApp,
  resolve: false,
  component: PresentPage,
  width: 720,
});
