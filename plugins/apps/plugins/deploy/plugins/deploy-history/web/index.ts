import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DeploymentDetail } from "@plugins/apps/plugins/deploy/plugins/deployments/web";
import { DeployHistorySection } from "./components/deploy-history-section";

export default {
  description:
    "History section of the deployment pane: this deployment's durable run ledger (`deploy_runs`) as a server-delegated, keyset-paginated DataView — outcome and the leg a failure died on, verb, short commit, pinned release run, duration and relative time, with a failed run's CLI message verbatim. The record beside the in-memory live view, so what happened here survives a backend restart.",
  contributions: [
    DeploymentDetail.Section({
      id: "history",
      label: "History",
      component: DeployHistorySection,
    }),
  ],
} satisfies PluginDefinition;
