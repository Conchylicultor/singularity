import { defineRoute } from "@plugins/primitives/plugins/pane/core";

export const buildRoute = defineRoute({ id: "build", segment: "build" });

export const buildDetailRoute = defineRoute({
  id: "build-detail",
  segment: "r/:runId",
  parent: buildRoute,
});
