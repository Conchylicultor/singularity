import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  DeploymentDetail,
  Deployments,
} from "@plugins/apps/plugins/deploy/plugins/deployments/web";
import { RemoteDeploySection } from "./components/remote-deploy-section";
import { OutputSection } from "./components/output-section";
import { ReleaseField } from "./components/release-field";

export default {
  description:
    "Deploy one composition to its remote server: a single Deploy button launching the `update` sequence (converge → build a platform-pinned candidate unless one is already current → ship that pinned run id), the three-phase report of the running deploy, what is currently built and how it relates to HEAD, the public URLs to inspect the deployed app, the phase-following deploy/build log output section, and the `Release` column contributed into the deployments list.",
  contributions: [
    DeploymentDetail.Section({
      id: "deploy",
      label: "Deploy to server",
      component: RemoteDeploySection,
    }),
    DeploymentDetail.Section({
      id: "output",
      label: "Output",
      component: OutputSection,
    }),
    Deployments.Fields({
      id: "release",
      section: null,
      component: ReleaseField,
    }),
  ],
} satisfies PluginDefinition;
