import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Runs } from "@plugins/runs/web";
import { DEPLOY_RUN_KIND } from "../core";
import { DeployRunFields } from "./components/deploy-run-fields";
import { DeployRunRow } from "./components/deploy-run-row";

export default {
  description:
    "The deploy arm's presence on the merged run surface: the kind's label, its eight own columns (verb, failed phase, server / deployment / composition / release-run / commit ids, exit code) as real filterable and sortable SQL dimensions, and the list row that renders the CLI's refusal text verbatim beside the leg of an update that died. Contributes no row activation — see the plugin's CLAUDE.md.",
  contributions: [
    // No `open`. The row carries both ids the deployment pane needs, but
    // `deploymentDetailPane` is a legacy segment-form pane: its typed params are
    // its own only, so `openPane` cannot be handed the `serverId` its ancestor
    // needs, and an open from anywhere but the server page lands on a "server
    // not found" column. A row that does not activate is honest; a click that
    // silently goes nowhere is not. Converting that pane to `Pane.define({ route })`
    // types the parent params and mints the `.link` a real cross-app hand-off
    // needs — at which point `open` is two lines here.
    Runs.Kind({ kind: DEPLOY_RUN_KIND, label: "Deploy" }),
    Runs.Row({ match: DEPLOY_RUN_KIND, component: DeployRunRow }),
    Runs.Fields({
      id: DEPLOY_RUN_KIND,
      section: "Deploy",
      component: DeployRunFields,
    }),
  ],
} satisfies PluginDefinition;
