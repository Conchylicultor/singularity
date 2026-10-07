import { defineRoute } from "@plugins/primitives/plugins/pane/core";

/** The Automations list, in the agent manager. */
export const automationsRoute = defineRoute({
  id: "automations",
  segment: "automations",
});

/** One automation: its settings, sources and the tasks it filed. */
export const automationDetailRoute = defineRoute({
  id: "automation-detail",
  segment: "automation/:automationId",
  parent: automationsRoute,
});
