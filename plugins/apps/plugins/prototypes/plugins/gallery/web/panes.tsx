import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { prototypesApp } from "@plugins/apps/plugins/prototypes/plugins/shell/core";
import { PrototypeGallery } from "./components/prototype-gallery";
import { PrototypeDetail } from "./components/prototype-detail";

const prototypesGalleryRoute = defineRoute({
  id: "prototypes-gallery",
  segment: "",
});

/** The gallery root pane: bare `/prototypes`. */
export const prototypesGalleryPane = Pane.define({
  route: prototypesGalleryRoute,
  app: prototypesApp,
  appIndex: true,
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
  route: defineRoute({
    id: "prototypes-detail",
    segment: "proto/:name",
    parent: prototypesGalleryRoute,
  }),
  app: prototypesApp,
  resolve: false,
  component: PrototypeDetail,
  width: 720,
});
