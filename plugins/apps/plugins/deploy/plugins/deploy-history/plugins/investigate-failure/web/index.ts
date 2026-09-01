import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DeployRunItemActions } from "@plugins/apps/plugins/deploy/plugins/deploy-history/web";
import { InvestigateFailureAction } from "./components/investigate-failure-action";

export default {
  description:
    "Contributes the investigate row action to every failed run in a deployment's History, launching an agent briefed on that failure — the CLI's own message verbatim, the run's identity and pinned bundle, and where the transcript is.",
  contributions: [
    DeployRunItemActions({
      id: "investigate-failure",
      component: InvestigateFailureAction,
    }),
  ],
} satisfies PluginDefinition;
