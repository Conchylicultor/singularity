import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ATTEMPT_STATUS_META,
  AttemptStatusBadge,
  attemptStatusLabel,
} from "./components/attempt-status";

export default {
  description:
    "Single source of truth for Attempt status display metadata — badge tint, dot tint and sentence-case label, so a chip and a badge for the same attempt cannot disagree.",
} satisfies PluginDefinition;
