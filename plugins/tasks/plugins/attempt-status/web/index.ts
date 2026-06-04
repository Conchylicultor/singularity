import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ATTEMPT_STATUS_META, AttemptStatusBadge } from "./components/attempt-status";

export default {
  name: "Attempt: Status",
  description:
    "Single source of truth for Attempt status display metadata — badge color and sentence-case label.",
} satisfies PluginDefinition;
