import { Pane } from "@plugins/primitives/plugins/pane/web";
import { PrototypeGallery } from "./components/prototype-gallery";
import { PrototypeDetail } from "./components/prototype-detail";

/** The gallery root pane: bare `/prototypes`. Its body is its own UI (no chrome). */
export const prototypesGalleryPane = Pane.define({
  id: "prototypes-gallery",
  segment: "",
  appPath: "/prototypes",
  component: PrototypeGallery,
  chrome: false,
  width: 360,
});

/** Focus / Compare detail for one prototype. */
export const prototypeDetailPane = Pane.define({
  id: "prototypes-detail",
  defaultAncestors: [prototypesGalleryPane],
  segment: "proto/:name",
  resolve: false,
  component: PrototypeDetail,
  width: 720,
});
