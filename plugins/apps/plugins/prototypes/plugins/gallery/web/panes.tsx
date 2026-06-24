import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { PrototypeGallery } from "./components/prototype-gallery";
import { PrototypeDetail } from "./components/prototype-detail";

/** The gallery root pane: bare `/prototypes`. */
export const prototypesGalleryPane = Pane.define({
  id: "prototypes-gallery",
  segment: "",
  appPath: "/prototypes",
  component: PrototypesGalleryBody,
  width: 360,
});

function PrototypesGalleryBody() {
  return (
    <PaneChrome pane={prototypesGalleryPane} title="Prototypes">
      <PrototypeGallery />
    </PaneChrome>
  );
}

/** Focus / Compare detail for one prototype. */
export const prototypeDetailPane = Pane.define({
  id: "prototypes-detail",
  defaultAncestors: [prototypesGalleryPane],
  segment: "proto/:name",
  resolve: false,
  component: PrototypeDetail,
  width: 720,
});
