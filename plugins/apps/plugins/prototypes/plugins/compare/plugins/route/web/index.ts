import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Counterpart } from "@plugins/apps/plugins/prototypes/plugins/compare/web";
import {
  RouteCounterpart,
  WholeAppCounterpart,
} from "./components/route-counterpart";

export default {
  description:
    "The route: and app: counterpart kinds for the prototype Compare stage: the running app itself, framed at an in-app path on this deploy's own origin — chromeless for route: (route:/agents/c/123: no rail, no tab bar, just the screen) and with its chrome for app: (app:/agents: rail, tab bar and action bar included) — so a whole-screen or whole-app mock is compared against the real thing as this branch renders it, never a second implementation that could drift.",
  contributions: [
    Counterpart.Kind({
      match: "route",
      label: "App screen",
      example: "route:/agents",
      component: RouteCounterpart,
    }),
    Counterpart.Kind({
      match: "app",
      label: "Whole app",
      example: "app:/agents",
      component: WholeAppCounterpart,
    }),
  ],
} satisfies PluginDefinition;
