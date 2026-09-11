import { defineRoute } from "@plugins/primitives/plugins/pane/core";

// The Debug → Queue pane's route, in `core` so a plugin that links to the
// queue (the health report's Job queue row) can name it without loading this
// plugin's web half. Same shape as `reports/core/routes.ts`.
export const queueRoute = defineRoute({ id: "queue", segment: "queue" });
