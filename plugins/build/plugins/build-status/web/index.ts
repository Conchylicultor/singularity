import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  BUILD_STATUS_META,
  BUILD_STATUS_OPTIONS,
  BuildStatusBadge,
  BuildStatusChip,
  BuildStatusDot,
} from "./components/build-status";

export default {
  description:
    "Single source of truth for build-run status display metadata — label, badge variant, and dot color per BuildStatus.",
} satisfies PluginDefinition;
