import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ReleaseDetail } from "@plugins/apps/plugins/studio/plugins/compositions/plugins/release/web";
import { ReleaseInfo } from "./components/release-info";

export default {
  description:
    "Status, composition, target, platform, and timing section in the release detail pane.",
  contributions: [
    ReleaseDetail.Section({ id: "info", label: "Info", component: ReleaseInfo }),
  ],
} satisfies PluginDefinition;
