import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ReleaseDetail } from "@plugins/apps/plugins/studio/plugins/release/web";
import { ReleaseArtifact } from "./components/release-artifact";

export default {
  description:
    "Artifact path plus local preview (start/stop + live link) section in the release detail pane.",
  contributions: [
    ReleaseDetail.Section({ id: "artifact", label: "Artifact", component: ReleaseArtifact }),
  ],
} satisfies PluginDefinition;
