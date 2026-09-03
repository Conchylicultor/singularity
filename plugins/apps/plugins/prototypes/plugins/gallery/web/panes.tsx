import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
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

const prototypeDetailRoute = defineRoute({
  id: "prototypes-detail",
  segment: "proto/:name",
  parent: prototypesGalleryRoute,
});

/** Focus / Compare detail for one prototype. */
export const prototypeDetailPane = Pane.define({
  route: prototypeDetailRoute,
  app: prototypesApp,
  resolve: false,
  component: PrototypeDetail,
  width: 720,
});
