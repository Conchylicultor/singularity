import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PrototypeFrameActions } from "@plugins/apps/plugins/prototypes/plugins/canvas/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { PresentMenu } from "./components/present-menu";
import { prototypePresentPane } from "./panes";

export default {
  description:
    "Present one canvas frame without the app around it: a per-frame Present menu (a frame action) with In this app tab (the tab bar stays) plus a new-app-tab icon, In this browser tab plus a new-browser-tab icon, and Full screen (F, which presents the selected frame). While presenting, hovering shows the frame's tag with its version stepper and 'i of n', Exit, the options pill and the size & zoom chip, and the left and right arrow keys flip through the canvas's frames. A new tab opens present/<id>/<sha|live>/<picks?>, a one-frame page carrying the frame's version and own picks.",
  contributions: [
    Pane.Register({ pane: prototypePresentPane }),
    PrototypeFrameActions({ id: "present", component: PresentMenu }),
  ],
  slots: {
    "prototypes-present": prototypePresentPane,
  },
} satisfies PluginDefinition;
