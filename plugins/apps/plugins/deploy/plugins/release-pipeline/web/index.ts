import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  DeploymentDetail,
  Deployments,
} from "@plugins/apps/plugins/deploy/plugins/deployments/web";
import { PipelineSection } from "./components/pipeline-section";
import { OutputSection } from "./components/output-section";
import { ReleaseField } from "./components/release-field";

export default {
  description:
    "Build → Rehearse → Ship pipeline for one deployment: the four-step surface in the deployment pane (converge, build a platform-pinned candidate, the P3 rehearsal placeholder, ship the pinned run id behind a confirm), the deploy/build log output section, and the `Release` column contributed into the deployments list.",
  contributions: [
    DeploymentDetail.Section({
      id: "pipeline",
      label: "Release pipeline",
      component: PipelineSection,
    }),
    DeploymentDetail.Section({
      id: "output",
      label: "Output",
      component: OutputSection,
    }),
    Deployments.Fields({ id: "release", component: ReleaseField }),
  ],
} satisfies PluginDefinition;
