import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { prototypeDetailPane } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { PresentMenu } from "./components/present-menu";
import { prototypePresentPane } from "./panes";

export default {
  description:
    "Present a prototype without the app around it, in four sizes: filling this app tab's surface (the tab bar stays, so the user can keep switching tabs), filling this browser tab, filling the screen (Fullscreen API), or opened in a new browser tab as a chromeless app page (present/<id>) that keeps the options picker. Contributed into the detail pane's Actions.",
  contributions: [
    Pane.Register({ pane: prototypePresentPane }),
    prototypeDetailPane.Actions({ id: "present", component: PresentMenu }),
  ],
  slots: {
    "prototypes-present": prototypePresentPane,
  },
} satisfies PluginDefinition;
