import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Runs } from "@plugins/runs/web";
import { buildDetailPane } from "@plugins/build/web";
import { BUILD_RUN_KIND } from "@plugins/build/plugins/run-ledger/core";
import { BuildRunFields } from "./components/build-run-fields";
import { BuildRunLeading } from "./components/build-run-leading";

export default {
  description:
    "The build arm's presence on the merged run surface: the Build kind (whose rows open the existing build run-detail pane), the six-way build status dot as the list row's leading indicator, and the status / targets / commit / exit-code columns only a build row has.",
  contributions: [
    Runs.Kind({
      kind: BUILD_RUN_KIND,
      label: "Build",
      // The run-detail pane already exists and is already reached by run id
      // alone — the merged row carries everything it needs, so a build row
      // activates from the merged list exactly as it does from the build pane.
      open: (run, { openPane }) =>
        openPane(buildDetailPane, { runId: run.id }, { mode: "push" }),
    }),
    Runs.Leading({ match: BUILD_RUN_KIND, component: BuildRunLeading }),
    Runs.Fields({
      id: BUILD_RUN_KIND,
      // Its own band in every field list — the merged schema carries four arms'
      // columns and they read as four short lists, not one flat forty.
      section: "Build",
      component: BuildRunFields,
    }),
  ],
} satisfies PluginDefinition;
