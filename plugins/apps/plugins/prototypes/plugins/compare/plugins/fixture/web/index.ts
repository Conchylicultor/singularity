import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Counterpart } from "@plugins/apps/plugins/prototypes/plugins/compare/web";
import { FixtureCounterpart } from "./components/fixture-counterpart";

export default {
  description:
    "The fixture: counterpart kind for the prototype Compare stage: the real app component a prototype mocks, as a layout-harness fixture looked up by id (fixture:<id>) in this worktree's catalog and rendered live at the stage's shared width. The only place prototypes are tied to app internals.",
  contributions: [
    Counterpart.Kind({
      match: "fixture",
      label: "App component",
      example: "fixture:control-panel/setting-rail",
      component: FixtureCounterpart,
    }),
  ],
} satisfies PluginDefinition;
