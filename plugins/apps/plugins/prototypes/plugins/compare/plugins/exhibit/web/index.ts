import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Counterpart } from "@plugins/apps/plugins/prototypes/plugins/compare/web";
import { ExhibitCounterpart } from "./components/exhibit-counterpart";

export default {
  description:
    "The exhibit: counterpart kind for the prototype canvas's Real app frame: one real app component, looked up by id (exhibit:<id>) in the exhibit catalog (plugin-meta/exhibits — any plugin's exhibits/ folder, isolated or app) and rendered inside the running app at the canvas's size. fixture: and component: are aliases of it, kept so prototypes written before the catalog unified still resolve.",
  contributions: [
    Counterpart.Kind({
      match: "exhibit",
      label: "App exhibit",
      example: "exhibit:task-draft/composer",
      component: ExhibitCounterpart,
    }),
    // Aliases: the two kinds the exhibit catalog replaced. Prototypes are
    // shared by every worktree, so tags written as `fixture:` / `component:`
    // must keep resolving until every prototype says `exhibit:`.
    Counterpart.Kind({
      match: "fixture",
      label: "App exhibit (alias of exhibit:)",
      example: "fixture:control-panel/setting-rail",
      component: ExhibitCounterpart,
    }),
    Counterpart.Kind({
      match: "component",
      label: "App exhibit (alias of exhibit:)",
      example: "component:task-draft/composer",
      component: ExhibitCounterpart,
    }),
  ],
} satisfies PluginDefinition;
