import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  DeploymentDetail,
  DeploymentItemActions,
} from "@plugins/apps/plugins/deploy/plugins/deployments/web";
import { LocalServeSection } from "./components/local-serve-section";
import { ServeAction } from "./components/serve-action";

export default {
  description:
    "Test locally: the deployment pane's section for the composition served on the shared gateway (its live URL and what it does and does not prove), plus the one-button serve/open shortcut on the deployments list row.",
  contributions: [
    DeploymentDetail.Section({
      id: "serve",
      label: "Test locally",
      component: LocalServeSection,
    }),
    DeploymentItemActions({ id: "serve", component: ServeAction }),
  ],
} satisfies PluginDefinition;
