import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Runs } from "@plugins/runs/web";
import { DEPLOY_RUN_KIND } from "../core";
import { DeployRunFields } from "./components/deploy-run-fields";
import { openDeployRun } from "./internal/open-run";

export default {
  description:
    "The deploy arm's presence on the merged run surface: the Deploy kind (whose rows open the deployment detail pane on the server the run went to), and its eight own columns (verb, failed phase, server / deployment / composition / release-run / commit ids, exit code) as real filterable and sortable SQL dimensions.",
  contributions: [
    Runs.Kind({
      kind: DEPLOY_RUN_KIND,
      label: "Deploy",
      open: (run, { openPane }) => openDeployRun(run, openPane),
    }),
    Runs.Fields({
      id: DEPLOY_RUN_KIND,
      section: "Deploy",
      component: DeployRunFields,
    }),
  ],
} satisfies PluginDefinition;
