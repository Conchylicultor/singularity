import { defineRoute } from "@plugins/primitives/plugins/pane/core";

/**
 * The app's two routes, declared here — beside `prototypesApp` — rather than in
 * the plugins that mount a pane on them. Two plugins need each one: the gallery
 * pane and the detail pane nest (the detail route's parent is the gallery's),
 * and the gallery opens the detail pane while the detail pane's plugin
 * (`canvas`) must not depend back on the gallery. `core/`, so the CLI builds the
 * same URLs without importing React.
 */

/** The gallery root pane: bare `/prototypes`. */
export const prototypesGalleryRoute = defineRoute({
  id: "prototypes-gallery",
  segment: "",
});

/**
 * One prototype's canvas. The optional last part is the coarse canvas layout:
 * bare `proto/<id>` opens one frame, `proto/<id>/compare` opens the prototype
 * beside the first contributed frame source (the real app).
 */
export const prototypeDetailRoute = defineRoute({
  id: "prototypes-detail",
  segment: "proto/:name/:layout?",
  parent: prototypesGalleryRoute,
});
