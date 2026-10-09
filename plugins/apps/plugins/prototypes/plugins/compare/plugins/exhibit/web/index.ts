import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Counterpart } from "@plugins/apps/plugins/prototypes/plugins/compare/web";
import { ExhibitCounterpart } from "./components/exhibit-counterpart";

export default {
  description:
    "The exhibit: counterpart kind for the prototype canvas's Real app frame: one real app component, looked up by id (exhibit:<id>) in the exhibit catalog (plugin-meta/exhibits — any plugin's exhibits/ folder, isolated or app) and rendered inside the running app at the canvas's size — in the theme of the app named after an @ (exhibit:<id>@/agents renders it inside the agent manager's theme boundary).",
  contributions: [
    Counterpart.Kind({
      match: "exhibit",
      label: "App exhibit",
      example: "exhibit:task-draft/composer",
      component: ExhibitCounterpart,
    }),
  ],
} satisfies PluginDefinition;
