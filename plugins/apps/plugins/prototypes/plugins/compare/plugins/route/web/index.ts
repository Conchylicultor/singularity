import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Counterpart } from "@plugins/apps/plugins/prototypes/plugins/compare/web";
import { RouteCounterpart } from "./components/route-counterpart";

export default {
  description:
    "The route: counterpart kind for the prototype Compare stage: the running app itself, framed chromeless (no rail, no tab bar) at an in-app path (route:/agents/c/123) on this deploy's own origin, so a whole-screen mock is compared against the real screen as this branch renders it — never a second implementation that could drift.",
  contributions: [
    Counterpart.Kind({
      match: "route",
      label: "App screen",
      example: "route:/agents",
      component: RouteCounterpart,
    }),
  ],
} satisfies PluginDefinition;
