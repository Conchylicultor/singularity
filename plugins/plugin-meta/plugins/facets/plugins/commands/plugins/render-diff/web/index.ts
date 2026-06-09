import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  commandsToComparable,
  type CommandDef,
} from "@plugins/plugin-meta/plugins/facets/plugins/commands/core";

export default {
  description: "Diff renderer for the commands facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "commands",
      label: "Commands",
      toComparable: (data) => commandsToComparable(data as CommandDef[]),
    }),
  ],
} satisfies PluginDefinition;
