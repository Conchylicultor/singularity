import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { prototypeDetailPane } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { PresentMenu } from "./components/present-menu";

export default {
  description:
    "Present a prototype without the app around it: filling this browser tab, filling the screen (Fullscreen API), or opened as its own document in a new browser tab. Contributed into the detail pane's Actions.",
  contributions: [
    prototypeDetailPane.Actions({ id: "present", component: PresentMenu }),
  ],
} satisfies PluginDefinition;
