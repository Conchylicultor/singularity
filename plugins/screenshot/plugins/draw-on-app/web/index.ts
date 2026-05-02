import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { DrawOnAppButton } from "./components/draw-on-app-button";

export default {
  id: "draw-on-app",
  name: "Draw on App",
  description:
    "Toolbar button to draw freehand on the live app, capture as a screenshot with strokes baked in, and pre-attach to +improve.",
  contributions: [
    Shell.Toolbar({ id: "draw-on-app", component: DrawOnAppButton, group: "actions" }),
  ],
} satisfies PluginDefinition;
