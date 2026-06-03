import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { DrawOnAppButton } from "./components/draw-on-app-button";

export default {
  id: "draw-on-app",
  name: "Draw on App",
  description:
    "Toolbar button to draw freehand on the live app, capture as a screenshot with strokes baked in, and pre-attach to +improve.",
  contributions: [
    ActionBar.Item({ id: "draw-on-app", component: DrawOnAppButton }),
  ],
} satisfies PluginDefinition;
