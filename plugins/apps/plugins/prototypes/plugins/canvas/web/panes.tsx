import { Pane } from "@plugins/primitives/plugins/pane/web";
import {
  prototypeDetailRoute,
  prototypesApp,
} from "@plugins/apps/plugins/prototypes/plugins/shell/core";
import { PrototypeDetail } from "./components/prototype-detail";

/**
 * One prototype's canvas, at `proto/<id>` (what the CLI prints). It reopens as
 * this browser last left it — see `PrototypeDetailProvider`'s `remember`.
 */
export const prototypeDetailPane = Pane.define({
  route: prototypeDetailRoute,
  app: prototypesApp,
  resolve: false,
  component: PrototypeDetail,
  width: 720,
});
