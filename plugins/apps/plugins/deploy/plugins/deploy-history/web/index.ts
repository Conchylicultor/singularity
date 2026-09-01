import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DeploymentDetail } from "@plugins/apps/plugins/deploy/plugins/deployments/web";
import { DeployHistorySection } from "./components/deploy-history-section";
import { DeployRunItemActions } from "./slots";

export { DeployRunItemActions } from "./slots";

export default {
  description:
    "History section of the deployment pane: this deployment's durable run ledger (`deploy_runs`) as a server-delegated, keyset-paginated DataView — outcome and the leg a failure died on, verb, short commit, pinned release run, duration and relative time, with a failed run's CLI message verbatim. The record beside the in-memory live view, so what happened here survives a backend restart. Owns the row-action slot its children hang a failed run's next step off.",
  contributions: [
    DeploymentDetail.Section({
      id: "history",
      label: "History",
      component: DeployHistorySection,
    }),
  ],
  slots: {
    itemActions: DeployRunItemActions,
  },
} satisfies PluginDefinition;
