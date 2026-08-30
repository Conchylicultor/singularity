import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  RUN_OUTCOME_META,
  RUN_OUTCOME_OPTIONS,
  RunOutcomeDot,
  RunOutcomeChip,
  RunOutcomeBadge,
} from "./components/run-outcome";

export default {
  description:
    "The shared run-outcome display: the colour/label metadata, the derived filter options, and the dot / chip / badge every run kind renders its outcome through — so a build row and a backup row cannot disagree about what `failed` looks like.",
} satisfies PluginDefinition;
