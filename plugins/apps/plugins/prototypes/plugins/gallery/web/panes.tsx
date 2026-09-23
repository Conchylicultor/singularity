import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  prototypesApp,
  prototypesGalleryRoute,
} from "@plugins/apps/plugins/prototypes/plugins/shell/core";
import { PrototypeGallery } from "./components/prototype-gallery";

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
