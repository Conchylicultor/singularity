import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ReleaseDetail } from "@plugins/apps/plugins/studio/plugins/compositions/plugins/release/web";
import { ReleaseLogSection } from "./components/release-log-section";

export default {
  description:
    "Live + persisted release log stream section in the release detail pane.",
  contributions: [
    ReleaseDetail.Section({ id: "logs", label: "Logs", component: ReleaseLogSection }),
  ],
} satisfies PluginDefinition;
