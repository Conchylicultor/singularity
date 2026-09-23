import { Pane } from "@plugins/primitives/plugins/pane/web";
import {
  prototypeDetailRoute,
  prototypesApp,
} from "@plugins/apps/plugins/prototypes/plugins/shell/core";
import { PrototypeDetail } from "./components/prototype-detail";

/**
 * One prototype's canvas. The URL's optional last part is the coarse layout:
 * bare `proto/<id>` (what the CLI prints) opens frame A alone,
 * `proto/<id>/compare` opens A beside the first contributed frame source (the
 * real app) — and the canvas writes it back as a source frame comes and goes.
 */
export const prototypeDetailPane = Pane.define({
  route: prototypeDetailRoute,
  app: prototypesApp,
  resolve: false,
  component: PrototypeDetail,
  width: 720,
});
