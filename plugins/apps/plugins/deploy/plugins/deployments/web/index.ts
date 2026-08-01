import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ServerDetail } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { DeploymentsSection } from "./components/deployments-section";
import {
  DeploymentItemActions,
  ConvergeAction,
  ShipAction,
  DeleteDeploymentAction,
} from "./components/deployment-item-actions";

export { DeploymentItemActions } from "./components/deployment-item-actions";

export default {
  description:
    "Deployments section of a server's page: this server's deployments as a DataView (composition, hostnames, loopback port, last run, plus the derived install names read-only), an add affordance whose composition picker reads the compositions config, Converge / Ship row actions that launch the CLI, and the live deploy log panel.",
  contributions: [
    ServerDetail.Section({
      id: "deployments",
      label: "Deployments",
      component: DeploymentsSection,
    }),
    // The two verbs and Delete are contributed into this plugin's own row-action
    // slot rather than hard-rendered, so the row's affordances stay a set the
    // reorder config orders and a later plugin can extend (a rollback action,
    // say) without touching the list.
    DeploymentItemActions({ id: "converge", component: ConvergeAction }),
    DeploymentItemActions({ id: "ship", component: ShipAction }),
    DeploymentItemActions({ id: "delete", component: DeleteDeploymentAction }),
  ],
} satisfies PluginDefinition;
